import type { DomainEvent } from "../../domain/events";
import {
  asEventId,
  asStepExecId,
  asWorkflowId,
  type ArtifactId,
  type StepExecId,
  type StepId,
  type WorkflowId,
} from "../../domain/ids";
import {
  MAX_INVOCATION_DEPTH,
  readTemplateInvokeRef,
  templateInvokeRefKey,
} from "../../domain/services/template-invoke";
import {
  findStep,
  type StepKindId,
  type WorkflowTemplate,
} from "../../domain/template";
import { isExit, successors } from "../../domain/services/transition-policy";
import {
  buildIterationKey,
  inferIterationScopes,
  isSequentialForeach,
  iterationKeyMatches,
  parseIterationIndex,
  type IterationScopes,
} from "../../domain/services/iteration-scopes";
import type { IterationRecord } from "../../domain/projection";
import type { ArtifactPayload } from "../../domain/artifact-schemas";
import type { ArtifactStore } from "../ports/outbound/artifact-store";
import type { ClockPort } from "../ports/outbound/clock";
import type { EnvironmentPort } from "../ports/outbound/environment";
import type { EventBus, LlmSessionBus } from "../ports/outbound/event-bus";
import type { EventLog } from "../ports/outbound/event-log";
import type { FileSystemPort } from "../ports/outbound/file-system";
import type { HashPort } from "../ports/outbound/hash";
import type { IdGenerator } from "../ports/outbound/id-generator";
import type { LinearGateway } from "../ports/outbound/linear-gateway";
import type { LLMGateway } from "../ports/outbound/llm-gateway";
import type { LoggerPort } from "../ports/outbound/logger";
import type { Notifier } from "../ports/outbound/notifier";
import type { PathPort } from "../ports/outbound/path";
import type { RunLog } from "../ports/outbound/run-log";
import type { ShellGateway } from "../ports/outbound/shell-gateway";
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import type { ParserRegistry } from "../ports/outbound/parser-registry";
import type { ParserRuntime } from "../ports/outbound/parser-runtime";
import type { SkillRegistry } from "../ports/outbound/skill-registry";
import type { EngineState } from "../engine-state";
import type {
  PortSpec,
  RunContextInput,
  StepRunner,
  StepRunnerRegistry,
} from "../step-runner";
import type { StepDef, Transition } from "../../domain/template";
import {
  loadAndParseArtifact,
  putArtifactPayload,
  type ValidationMode,
} from "../artifact-io";
import {
  ArtifactKindMismatchError,
  ArtifactSchemaError,
} from "../../domain/artifact-errors";
import { parseArtifact } from "../../domain/parse-artifact";
import type { Artifact, ArtifactKind } from "../../domain/artifact";
import {
  isContainerArtifactKind,
  parseListArtifactKind,
} from "../../domain/artifact";
import type { ArtifactSchemaRegistry } from "../ports/outbound/artifact-schema-registry";
import { extractDisplayableContent } from "../../domain/artifact-serializer";
import type { InstanceState } from "../../domain/projection";
import type { StepExecution } from "../../domain/instance";
import {
  isJudgeAuthor,
  judgeLoopAuthor,
  parseJudgeFeedback,
} from "../../domain/judge-feedback";
import { asLoopId } from "../../domain/ids";

type Deps = {
  bus: EventBus;
  log: EventLog;
  clock: ClockPort;
  ids: IdGenerator;
  state: EngineState;
  templates: TemplateRegistry;
  runners: StepRunnerRegistry;
  artifactStore: ArtifactStore;
  artifactSchemas: ArtifactSchemaRegistry;
  llm: LLMGateway;
  linear: LinearGateway;
  shell: ShellGateway;
  runLog: RunLog;
  notifier: Notifier;
  llmSession: LlmSessionBus;
  logger: LoggerPort;
  hash: HashPort;
  path: PathPort;
  environment: EnvironmentPort;
  fs: FileSystemPort;
  validationMode: ValidationMode;
  /**
   * Dynamic-artifact-schema parser registry + runtime. Threaded down to runners
   * via `ctx.deps.parsers` / `ctx.deps.parserRuntime` so an LLM-facing runner
   * can apply the active parser to its inputs right before prompt assembly
   * (cf. `apply-active-parsers.ts`). Optional — kept nullable so tests that
   * don't care about parsing can construct an orchestrator without setting
   * up a full registry/runtime pair.
   */
  parsers?: ParserRegistry;
  parserRuntime?: ParserRuntime;
  /**
   * Skill registry forwarded to `ctx.deps.skills`. Used by `skill.loader` to
   * resolve a saved prompt body. Optional — tests can skip wiring it.
   */
  skills?: SkillRegistry;
};

export type InstanceOrchestrator = {
  start(): void;
  stop(): void;
};

export const createInstanceOrchestrator = (deps: Deps): InstanceOrchestrator => {
  const locks = new Map<WorkflowId, Promise<void>>();

  const serialize = async (id: WorkflowId, fn: () => Promise<void>): Promise<void> => {
    const prev = locks.get(id) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(
      id,
      next.catch(() => undefined),
    );
    try {
      await next;
    } finally {
      if (locks.get(id) === next.catch(() => undefined)) {
        locks.delete(id);
      }
    }
  };

  const emit = async (evt: DomainEvent) => {
    await deps.log.append(evt);
    await deps.bus.publish(evt);
  };

  const validationMode: ValidationMode = deps.validationMode;

  /**
   * Cache `inferIterationScopes(template)` by template identity (templates are
   * fetched fresh per call but the registry returns the same object across
   * calls for a given (id, version)). Scope inference is pure and topology-
   * only, so it's safe to memoize.
   */
  const scopesCache = new WeakMap<WorkflowTemplate, IterationScopes>();
  const scopesOf = (template: WorkflowTemplate): IterationScopes => {
    let cached = scopesCache.get(template);
    if (cached) return cached;
    cached = inferIterationScopes(template);
    scopesCache.set(template, cached);
    return cached;
  };

  /**
   * Resolves the template an instance runs against. When the root template
   * contained `workflow.call` steps, the start flattened them into a pinned
   * `effectiveTemplate` (`sub-template-expand.md` §7) — the orchestrator runs
   * that graph verbatim. Otherwise it falls back to the registry resolution by
   * ref, exactly as before (backward compatible for pre-spec instances).
   */
  const templateForInstance = (
    inst: NonNullable<ReturnType<typeof deps.state.getInstance>>,
  ): Promise<WorkflowTemplate> =>
    inst.effectiveTemplate
      ? Promise.resolve(inst.effectiveTemplate)
      : deps.templates.resolve(inst.templateId, inst.templateVersion);

  /** Looks up the per-iteration record for a foreach + iterationKey pair. */
  const findIterationRecord = (
    inst: InstanceState,
    loopStepId: StepId,
    iterationKey: string | undefined,
  ): IterationRecord | undefined => {
    if (!iterationKey) return undefined;
    const records = inst.iterations.get(loopStepId);
    if (!records) return undefined;
    return records.find((r) => r.iterationKey === iterationKey);
  };

  /**
   * Post-run sanity check: the runner's declared output kind must match the
   * artifact's actual kind, and the on-disk payload must parse against the
   * schema. In strict mode any mismatch throws (turned into `StepFailed`
   * with `reason: "invalid-output"` by the surrounding try/catch). In
   * log-only mode we only warn — the artifact is already persisted, no use
   * blocking the workflow.
   */
  const assertProducedArtifactConforms = async (
    runner: StepRunner,
    kind: StepKindId,
    artifact: { id: ArtifactId; kind: ArtifactKind },
    stepConfig: Readonly<Record<string, unknown>> = {},
  ): Promise<void> => {
    if (validationMode === "off") return;
    let declaredKinds: ReadonlyArray<ArtifactKind> = [];
    try {
      // Resolve from the step's own config (so polymorphic runners that read a
      // dedicated field — e.g. `loop.collect.itemKind` — answer correctly),
      // overlaid with a synthetic `outputKind`/`inputKind` for the runners that
      // key off those (`user.input`, `claude_code.invoke`).
      const spec = runner.resolveSpec({
        config: { ...stepConfig, outputKind: artifact.kind, inputKind: artifact.kind },
      });
      declaredKinds = spec.outputs.map((o) => o.kind);
    } catch {
      // Runner needs more config to resolveSpec; we cannot enforce a kind
      // match without it, but we can still validate the payload below.
    }
    if (declaredKinds.length > 0 && !declaredKinds.includes(artifact.kind)) {
      const msg = `runner ${kind} declared output kinds [${declaredKinds.join("|")}] but produced ${artifact.kind}`;
      if (validationMode === "strict") throw new Error(msg);
      deps.logger.warn(`[wf:artifact] invalid_output ${msg}`);
      return;
    }
    try {
      const { meta, content } = await deps.artifactStore.get(artifact.id);
      const fmt = meta.metadata.payloadFormat ?? "plain";
      if (fmt !== "json-v1") {
        // Legacy artifact written by a pre-migration runner — skip validation.
        return;
      }
      const parsed = JSON.parse(content);
      parseArtifact(deps.artifactSchemas, artifact.kind, parsed);
    } catch (err) {
      const reason =
        err instanceof ArtifactSchemaError || err instanceof ArtifactKindMismatchError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      if (validationMode === "strict") {
        throw err instanceof Error ? err : new Error(reason);
      }
      deps.logger.warn(
        `[wf:artifact] invalid_output id=${artifact.id.slice(0, 8)} kind=${artifact.kind}: ${reason}`,
      );
    }
  };

  /**
   * Loads the artifact bound to a template variable into a `RunContextInput`.
   * Returns `null` if the variable is unset (caller decides whether to throw
   * — non-optional ports do; optional / isList ports tolerate).
   */
  const loadVariableInput = async (
    inst: InstanceState,
    portName: string,
    variableName: string,
  ): Promise<{ input: RunContextInput; artifactId: ArtifactId } | null> => {
    const artifactId = inst.variables.get(variableName);
    if (!artifactId) return null;
    const { meta } = await deps.artifactStore.get(artifactId);
    const loaded = await loadAndParseArtifact(
      deps.artifactStore,
      deps.artifactSchemas,
      artifactId,
      meta.kind,
      validationMode,
      deps.logger,
    );
    return {
      input: {
        port: portName,
        kind: loaded.meta.kind,
        content: loaded.content,
        payload: loaded.payload,
        artifactId,
      },
      artifactId,
    };
  };

  /**
   * Walks back the non-loop transition chain from a specific incoming
   * transition, skipping any `workspace.set` (passthrough, no artifact).
   * Returns the first data-producing source plus the `fromPort` declared on
   * the transition out of that source.
   */
  const resolveTransitionUpstreamData = (
    template: WorkflowTemplate,
    edge: Transition,
  ): { dataStepId: StepId; fromPort?: string } | null => {
    let curEdge: Transition | undefined = edge;
    while (curEdge) {
      const fromStep = findStep(template, curEdge.from);
      if (fromStep.kind === "workspace.set") {
        // Skip the passthrough — pick the previous incoming transition into
        // the workspace.set step itself.
        curEdge = template.transitions.find(
          (t) => !t.isLoop && t.to === curEdge!.from,
        );
        continue;
      }
      return { dataStepId: curEdge.from, fromPort: curEdge.fromPort };
    }
    return null;
  };

  /**
   * Resolves one input port: produces the (possibly empty, possibly N-ary)
   * list of `RunContextInput` entries the runner will receive for that port,
   * plus the underlying artifact ids for event-log replay.
   */
  const resolvePort = async (
    inst: InstanceState,
    template: WorkflowTemplate,
    step: StepDef,
    port: PortSpec,
    iterationKey?: string,
  ): Promise<{ inputs: RunContextInput[]; inputIds: ArtifactId[] }> => {
    const out: RunContextInput[] = [];
    const ids: ArtifactId[] = [];

    // 1. Variable (readsFrom) — prepended on isList, exclusive on mono.
    const variableName = step.readsFrom?.[port.name];
    const fromVar = variableName
      ? await loadVariableInput(inst, port.name, variableName)
      : null;

    // 2. Collect incoming non-loop transitions targeting this port. A
    //    transition matches when `toPort === port.name` (explicit), or when
    //    `toPort` is absent AND the step has exactly one input port — the
    //    legacy "implicit single port" case for backwards compatibility.
    const isSingleInput = (() => {
      const runner = deps.runners.resolve(step.kind);
      const spec = runner.resolveSpec({
        config: step.config,
        template: { variables: template.variables },
      });
      return spec.inputs.length === 1;
    })();
    const incoming: Array<{ edge: Transition; index: number }> = [];
    template.transitions.forEach((t, idx) => {
      if (t.isLoop) return;
      if (t.to !== step.id) return;
      if (t.toPort) {
        if (t.toPort !== port.name) return;
      } else if (!isSingleInput) {
        // No `toPort` on a multi-input step — defensive (validation rejects
        // this), but if encountered at runtime we ignore the edge.
        return;
      }
      incoming.push({ edge: t, index: idx });
    });
    // Sort by `order` ascending, then by creation index for stable ties.
    incoming.sort((a, b) => {
      const ao = typeof a.edge.order === "number" ? a.edge.order : Number.POSITIVE_INFINITY;
      const bo = typeof b.edge.order === "number" ? b.edge.order : Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      return a.index - b.index;
    });

    if (port.isList) {
      if (fromVar) {
        out.push(fromVar.input);
        ids.push(fromVar.artifactId);
      }
      // Special case — `loop.collect` joins all per-iteration outputs of its
      // upstream into a single list-shaped port. Resolve once per iteration
      // record so the runner receives exactly one entry per iteration in
      // iteration-index order.
      if (step.kind === "loop.collect") {
        for (const { edge } of incoming) {
          const upstream = resolveTransitionUpstreamData(template, edge);
          if (!upstream) continue;
          const scopes = scopesOf(template);
          const foreachId = scopes.foreachOf.get(step.id);
          if (!foreachId) continue;
          const records = inst.iterations.get(foreachId) ?? [];
          for (const rec of [...records].sort((a, b) => a.index - b.index)) {
            const loaded = await loadFromTransition(
              inst,
              template,
              edge,
              port.name,
              rec.iterationKey,
            );
            if (loaded) {
              out.push(loaded.input);
              ids.push(loaded.artifactId);
            }
          }
        }
      } else {
        for (const { edge } of incoming) {
          const loaded = await loadFromTransition(
            inst,
            template,
            edge,
            port.name,
            iterationKey,
          );
          if (loaded) {
            out.push(loaded.input);
            ids.push(loaded.artifactId);
          }
        }
      }
      if (out.length === 0 && !port.optional) {
        throw new Error(
          `step ${step.id}: port "${port.name}" (isList, non-optional) received 0 artifacts`,
        );
      }
      return { inputs: out, inputIds: ids };
    }

    // Mono-arité — at most one source. Variable wins over transition.
    if (fromVar) {
      return { inputs: [fromVar.input], inputIds: [fromVar.artifactId] };
    }
    if (incoming.length === 0) {
      // Entry step's `user.input` reads seedArtifacts directly.
      if (step.id === template.entryStep && step.kind === "user.input") {
        const seedIds = inst.seedArtifacts;
        const seedInputs: RunContextInput[] = [];
        for (const aid of seedIds) {
          const { meta, content } = await deps.artifactStore.get(aid);
          seedInputs.push({
            port: port.name,
            kind: meta.kind,
            content,
            payload: null,
            artifactId: aid,
          });
        }
        return { inputs: seedInputs, inputIds: [...seedIds] };
      }
      return { inputs: [], inputIds: [] };
    }
    if (incoming.length > 1) {
      // Validation should have rejected this; defensive guard.
      throw new Error(
        `step ${step.id}: port "${port.name}" got ${incoming.length} edges; isList=false`,
      );
    }
    const loaded = await loadFromTransition(
      inst,
      template,
      incoming[0].edge,
      port.name,
      iterationKey,
    );
    if (!loaded) return { inputs: [], inputIds: [] };
    return { inputs: [loaded.input], inputIds: [loaded.artifactId] };
  };

  /**
   * Resolves the artifact carried by one incoming transition, walking through
   * any intermediate `workspace.set` (passthrough). Returns `null` when the
   * upstream chain is incomplete (no data step, or no produced output yet).
   *
   * `iterationKey` is the consumer's iteration scope key (if any). It
   * constrains which producer execution is visible — a consumer inside scope
   * K sees producers inside scope K and producers fully outside any scope
   * (broadcast upstream); a consumer outside scopes never sees in-scope
   * artifacts (would leak iteration items).
   *
   * Special case: when the upstream data step is a `loop.foreach`, the
   * artifact returned is the per-iteration unit artifact materialized by
   * the orchestrator (recorded in `inst.iterations`), not the foreach's
   * stored list artifact.
   */
  const loadFromTransition = async (
    inst: InstanceState,
    template: WorkflowTemplate,
    edge: Transition,
    portName: string,
    iterationKey?: string,
  ): Promise<{ input: RunContextInput; artifactId: ArtifactId } | null> => {
    const upstream = resolveTransitionUpstreamData(template, edge);
    if (!upstream) return null;
    const { dataStepId, fromPort } = upstream;

    // Foreach upstream: each consumer iteration picks its own per-item artifact.
    const upstreamStep = findStep(template, dataStepId);
    if (upstreamStep.kind === "loop.foreach") {
      const record = findIterationRecord(inst, dataStepId, iterationKey);
      if (!record) return null;
      const loaded = await loadAndParseArtifact(
        deps.artifactStore,
        deps.artifactSchemas,
        record.itemArtifactId,
        (await deps.artifactStore.get(record.itemArtifactId)).meta.kind,
        validationMode,
        deps.logger,
      );
      return {
        input: {
          port: portName,
          kind: loaded.meta.kind,
          content: loaded.content,
          payload: loaded.payload,
          artifactId: record.itemArtifactId,
        },
        artifactId: record.itemArtifactId,
      };
    }

    // Walk the validated execs of the data step. If the requested slot was
    // not produced (= upstream branch chose a different port), return null
    // and let the consumer decide what to do — typically the convergent step
    // resolves inputs from the OTHER incoming edge that IS validated on its
    // slot, or the consumer is itself part of the dead subgraph that
    // `propagateSkip` already marked as skipped.
    const prevExec = [...inst.executions]
      .reverse()
      .find(
        (e) =>
          e.stepId === dataStepId &&
          e.status === "validated" &&
          e.outputs.size > 0 &&
          (fromPort ? e.outputs.has(fromPort) : true) &&
          iterationKeyMatches(e.iterationKey, iterationKey),
      );
    if (!prevExec) return null;
    const slot =
      fromPort ??
      (prevExec.outputs.size === 1
        ? [...prevExec.outputs.keys()][0]
        : prevExec.outputs.has("out")
          ? "out"
          : undefined);
    if (!slot) {
      throw new Error(
        `step ${edge.to}: cannot pick an output slot of ${dataStepId} — has ${prevExec.outputs.size} outputs (${[...prevExec.outputs.keys()].join("|")}) and no fromPort on the incoming transition`,
      );
    }
    const artifactId = prevExec.outputs.get(slot);
    if (!artifactId) {
      // The validated exec we picked above already guarantees the slot is
      // present (filter `e.outputs.has(fromPort)`). Reaching here means the
      // slot is undefined AND fromPort is undefined AND outputs.size <= 1 —
      // a malformed exec, which is a programming bug not a runtime concern.
      throw new Error(
        `step ${edge.to}: transition expected slot "${slot}" of ${dataStepId} but no artifact was produced for that slot (available: ${[...prevExec.outputs.keys()].join("|") || "none"})`,
      );
    }
    const { meta } = await deps.artifactStore.get(artifactId);
    const loaded = await loadAndParseArtifact(
      deps.artifactStore,
      deps.artifactSchemas,
      artifactId,
      meta.kind,
      validationMode,
      deps.logger,
    );
    return {
      input: {
        port: portName,
        kind: loaded.meta.kind,
        content: loaded.content,
        payload: loaded.payload,
        artifactId,
      },
      artifactId,
    };
  };

  /**
   * Builds the full `RunContextInput[]` for a step by resolving each declared
   * port independently and concatenating the results. A flat array (rather
   * than `Map<port, inputs[]>`) keeps the log/replay shape unchanged and lets
   * runners group by port via {@link groupInputsByPort} on demand.
   */
  const buildInputs = async (
    inst: InstanceState,
    template: WorkflowTemplate,
    stepId: StepId,
    iterationKey?: string,
  ): Promise<{ inputs: RunContextInput[]; inputIds: ArtifactId[] }> => {
    const step = findStep(template, stepId);
    const runner = deps.runners.resolve(step.kind);
    const spec = runner.resolveSpec({
      config: step.config,
      template: { variables: template.variables },
    });

    const allInputs: RunContextInput[] = [];
    const allIds: ArtifactId[] = [];
    for (const port of spec.inputs) {
      const resolved = await resolvePort(inst, template, step, port, iterationKey);
      allInputs.push(...resolved.inputs);
      allIds.push(...resolved.inputIds);
    }

    // User-input fallback: when the step is the entry and has no declared
    // inputs (older shapes), still hand it the seed artifacts. The new
    // resolvePort already handles the case where `user.input` declares a
    // single port — this branch covers the empty-inputs degenerate case.
    if (
      spec.inputs.length === 0 &&
      step.id === template.entryStep &&
      step.kind === "user.input"
    ) {
      const seedIds = inst.seedArtifacts;
      for (const aid of seedIds) {
        const { meta, content } = await deps.artifactStore.get(aid);
        allInputs.push({
          port: "input",
          kind: meta.kind,
          content,
          payload: null,
          artifactId: aid,
        });
        allIds.push(aid);
      }
    }
    return { inputs: allInputs, inputIds: allIds };
  };

  const buildLoopHistory = async (
    inst: InstanceState,
    template: WorkflowTemplate,
    stepId: StepId,
    iterationKey?: string,
  ): Promise<
    {
      previousOutput: string;
      humanFeedback: {
        summary: string;
        comments: ReadonlyArray<{ startLine: number; endLine: number; body: string }>;
      };
    }[]
  > => {
    // The looped execution lives on the upstream step that loops back to us
    // (typically a human.gate). Its `humanFeedback` is the user's review,
    // and its first input artifact is the previous output of `stepId`.
    const loopBackStepIds = new Set(
      template.transitions.filter((t) => t.isLoop && t.to === stepId).map((t) => t.from),
    );
    if (loopBackStepIds.size === 0) return [];
    const loopedGates = inst.executions.filter(
      (e) =>
        loopBackStepIds.has(e.stepId) &&
        e.status === "looped" &&
        iterationKeyMatches(e.iterationKey, iterationKey),
    );
    const history: {
      previousOutput: string;
      humanFeedback: {
        summary: string;
        comments: ReadonlyArray<{ startLine: number; endLine: number; body: string }>;
      };
    }[] = [];
    for (const lg of loopedGates) {
      const isJudge = lg.loopAuthor !== undefined && isJudgeAuthor(lg.loopAuthor);
      // For a judge-triggered loop:
      //  - `previousOutput` is the *subject* the judge reviewed, i.e. the
      //    output of the generator step — `inputArtifacts[0]` on the judge
      //    exec.
      //  - feedback comes from the judge's own output Markdown (the artifact
      //    emitted on `rejected` / `exhausted`), parsed back into
      //    `{summary, comments}`.
      // For a human-triggered loop the legacy behavior is preserved.
      let previousArtifactId;
      let feedback: { summary: string; comments: ReadonlyArray<{ startLine: number; endLine: number; body: string }> };
      if (isJudge) {
        previousArtifactId = lg.inputArtifacts[0];
        const judgeOutputId = lg.outputArtifact ?? [...lg.outputs.values()][0];
        if (judgeOutputId) {
          const { content: judgeContent } = await deps.artifactStore.get(judgeOutputId);
          const parsed = parseJudgeFeedback(extractDisplayableContent(judgeContent));
          feedback = {
            summary: parsed.summary,
            comments: parsed.comments.map((c) => ({
              startLine: c.anchor.startLine,
              endLine: c.anchor.endLine,
              body: c.body,
            })),
          };
        } else {
          feedback = { summary: "", comments: [] };
        }
      } else {
        // Pick the artifact that represents the LLM output we want to feed back:
        //  - merged claude_code.invoke (humanGateRequired): self-loops on its
        //    own step, the LLM output is `outputArtifact`.
        //  - chained `claude_code.invoke → human.gate`: the gate loops back,
        //    its `inputArtifacts[0]` is the upstream LLM output.
        previousArtifactId = lg.outputArtifact ?? lg.inputArtifacts[0];
        if (!lg.humanFeedback) continue;
        feedback = {
          summary: lg.humanFeedback.summary,
          comments: lg.humanFeedback.comments.map((c) => ({
            startLine: c.anchor.startLine,
            endLine: c.anchor.endLine,
            body: c.body,
          })),
        };
      }
      if (!previousArtifactId) continue;
      const { content } = await deps.artifactStore.get(previousArtifactId);
      deps.logger.info(
        `[wf:orch] buildLoopHistory exec=${lg.id.slice(0, 8)} author=${lg.loopAuthor ?? "user"} summary=${feedback.summary.length}ch comments=${feedback.comments.length}`,
      );
      history.push({
        previousOutput: extractDisplayableContent(content),
        humanFeedback: feedback,
      });
    }
    return history;
  };

  const startStep = async (
    inst: InstanceState,
    template: WorkflowTemplate,
    stepId: StepId,
    loopFrom?: StepExecId,
    iterationKey?: string,
  ): Promise<void> => {
    const { inputs, inputIds } = await buildInputs(
      inst,
      template,
      stepId,
      iterationKey,
    );
    const loopHistory = await buildLoopHistory(
      inst,
      template,
      stepId,
      iterationKey,
    );
    // Count prior `looped` executions of this step in the same iteration
    // scope. `attempt` is 0-indexed: the first ever invocation sees 0, the
    // re-run after a single loop sees 1, etc. Read by `llm.judge` to decide
    // when to escalate to its `exhausted` port. Derived from the projection
    // (no extra event variant required) — see `specs/llm-judge-bounded-retries.md`.
    const attempt = inst.executions.filter(
      (e) =>
        e.stepId === stepId &&
        e.status === "looped" &&
        iterationKeyMatches(e.iterationKey, iterationKey),
    ).length;
    const step = findStep(template, stepId);
    const stepExecId = asStepExecId(deps.ids.newId());
    deps.logger.info(
      `[wf:orch] startStep step=${stepId} kind=${step.kind} inputs=${inputs.length} loopHistory=${loopHistory.length}${loopFrom ? ` loopFrom=${loopFrom.slice(0, 8)}` : ""}${iterationKey ? ` iter=${iterationKey}` : ""}`,
    );
    const started: DomainEvent = {
      type: "StepStarted",
      eventId: asEventId(deps.ids.newId()),
      at: deps.clock.now(),
      instanceId: inst.id,
      stepExecId,
      stepId,
      kind: step.kind,
      inputArtifacts: inputIds,
      loopFrom,
      iterationKey,
    };
    await emit(started);

    const runner: StepRunner = deps.runners.resolve(step.kind);
    try {
      deps.logger.info(`[wf:runner] ${step.kind} run start exec=${stepExecId.slice(0, 8)}`);
      const outcome = await runner.run({
        instanceId: inst.id,
        stepExecId,
        stepId,
        step,
        inputs,
        loopHistory,
        attempt,
        workspace: { cwd: inst.cwd },
        deps: {
          artifactStore: deps.artifactStore,
          llm: deps.llm,
          linear: deps.linear,
          shell: deps.shell,
          runLog: deps.runLog,
          clock: deps.clock,
          ids: deps.ids,
          llmSession: deps.llmSession,
          logger: deps.logger,
          hash: deps.hash,
          path: deps.path,
          environment: deps.environment,
          fs: deps.fs,
          parsers: deps.parsers,
          parserRuntime: deps.parserRuntime,
          skills: deps.skills,
          artifactSchemas: deps.artifactSchemas,
        },
      });

      if (outcome.kind === "awaiting-human") {
        deps.logger.info(`[wf:runner] ${step.kind} → awaiting-human role=${outcome.actorRole}`);
        await emit({
          type: "StepAwaitingHumanGate",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId: inst.id,
          stepExecId,
          actorRole: outcome.actorRole,
        });
        await deps.notifier.humanGateOpened(inst.id, stepExecId, outcome.actorRole);
        return;
      }

      if (outcome.kind === "workspace-set") {
        deps.logger.info(`[wf:runner] ${step.kind} → workspace-set cwd=${outcome.cwd}`);
        await emit({
          type: "WorkspaceChanged",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId: inst.id,
          stepExecId,
          cwd: outcome.cwd,
        });
        await emit({
          type: "StepValidated",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId: inst.id,
          stepExecId,
          by: "auto",
        });
        return;
      }

      if (outcome.kind === "spawned-child") {
        deps.logger.info(`[wf:runner] ${step.kind} → spawned-child`);
        await spawnChildInstance(inst, step, stepExecId);
        return;
      }

      // Resolve the declared slot names for this step (once) — used to
      // shape-check `produced` / `produced-many` outcomes and to tag the
      // emitted `StepProducedArtifact` events with their `port`.
      let declaredOutputs: ReadonlyArray<{ name: string; kind: string }> = [];
      try {
        declaredOutputs = runner.resolveSpec({
          config: step.config,
          template: { variables: template.variables },
        }).outputs;
      } catch {
        // Polymorphic runner with incomplete config; the post-run schema
        // check below still catches the per-kind mismatch.
      }

      // Helper: emit `VariableAssigned` for `(port, artifactId)` if the step
      // maps this slot to a template variable. Centralized so every `produced*`
      // branch routes consistently.
      const maybeAssignVariable = async (
        port: string,
        artifactId: ArtifactId,
      ): Promise<void> => {
        const varName = step.writesTo?.[port];
        if (!varName) return;
        await emit({
          type: "VariableAssigned",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId: inst.id,
          stepExecId,
          variableName: varName,
          artifactId,
        });
      };

      if (outcome.kind === "produced-pending-human") {
        deps.logger.info(
          `[wf:runner] ${step.kind} → produced-pending-human artifact=${outcome.artifact.id.slice(0, 8)} role=${outcome.actorRole}`,
        );
        await assertProducedArtifactConforms(runner, step.kind, outcome.artifact, step.config);
        const port = declaredOutputs[0]?.name ?? "out";
        await emit({
          type: "StepProducedArtifact",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId: inst.id,
          stepExecId,
          artifactId: outcome.artifact.id,
          port,
        });
        await maybeAssignVariable(port, outcome.artifact.id);
        await emit({
          type: "StepAwaitingHumanGate",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId: inst.id,
          stepExecId,
          actorRole: outcome.actorRole,
        });
        await deps.notifier.humanGateOpened(inst.id, stepExecId, outcome.actorRole);
        return;
      }

      if (outcome.kind === "produced-many") {
        deps.logger.info(
          `[wf:runner] ${step.kind} → produced-many slots=${outcome.artifacts.map((a) => a.port).join("|")}`,
        );
        // Shape check: every produced slot must map to a declared port, but
        // coverage may be partial — a declared port absent from the slots is
        // treated as non-produced and skip-propagated downstream (same routing
        // as `produced-on-port`, see the `producedPorts` switch in
        // `afterValidated`). Only an *unknown* port is a hard error.
        if (declaredOutputs.length > 0) {
          const declaredNames = new Set(declaredOutputs.map((o) => o.name));
          const producedNames = new Set(outcome.artifacts.map((a) => a.port));
          const unknown = [...producedNames].filter((n) => !declaredNames.has(n));
          if (unknown.length > 0) {
            throw new Error(
              `runner-shape-mismatch: ${step.kind} produced unknown ports [${unknown.join(", ")}] (declared: [${[...declaredNames].join(", ")}])`,
            );
          }
        }
        for (const slot of outcome.artifacts) {
          await assertProducedArtifactConforms(runner, step.kind, slot.artifact, step.config);
          await emit({
            type: "StepProducedArtifact",
            eventId: asEventId(deps.ids.newId()),
            at: deps.clock.now(),
            instanceId: inst.id,
            stepExecId,
            artifactId: slot.artifact.id,
            port: slot.port,
          });
          await maybeAssignVariable(slot.port, slot.artifact.id);
        }
        if (step.humanGateRequired) {
          const cfgRole = step.config["actorRole"];
          const actorRole =
            (typeof cfgRole === "string" ? cfgRole : undefined) ??
            step.actorRole ??
            "Developer";
          await emit({
            type: "StepAwaitingHumanGate",
            eventId: asEventId(deps.ids.newId()),
            at: deps.clock.now(),
            instanceId: inst.id,
            stepExecId,
            actorRole,
          });
          await deps.notifier.humanGateOpened(inst.id, stepExecId, actorRole);
        } else {
          await emit({
            type: "StepValidated",
            eventId: asEventId(deps.ids.newId()),
            at: deps.clock.now(),
            instanceId: inst.id,
            stepExecId,
            by: "auto",
          });
        }
        return;
      }

      if (outcome.kind === "produced-on-port") {
        deps.logger.info(
          `[wf:runner] ${step.kind} → produced-on-port port=${outcome.port} artifact=${outcome.artifact.id.slice(0, 8)}`,
        );
        // Shape check: the chosen port must be one of the declared outputs.
        // No coverage requirement — by design only one port is materialized;
        // the orchestrator skips downstream steps reachable exclusively via
        // the unproduced ports (cf. propagateSkip in afterValidated).
        if (declaredOutputs.length > 0) {
          const declaredNames = new Set(declaredOutputs.map((o) => o.name));
          if (!declaredNames.has(outcome.port)) {
            throw new Error(
              `runner-shape-mismatch: ${step.kind} chose port "${outcome.port}" but declared outputs [${[...declaredNames].join(", ")}]`,
            );
          }
        }
        await assertProducedArtifactConforms(runner, step.kind, outcome.artifact, step.config);
        await emit({
          type: "StepProducedArtifact",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId: inst.id,
          stepExecId,
          artifactId: outcome.artifact.id,
          port: outcome.port,
        });
        await maybeAssignVariable(outcome.port, outcome.artifact.id);
        if (step.humanGateRequired) {
          const cfgRole = step.config["actorRole"];
          const actorRole =
            (typeof cfgRole === "string" ? cfgRole : undefined) ??
            step.actorRole ??
            "Developer";
          await emit({
            type: "StepAwaitingHumanGate",
            eventId: asEventId(deps.ids.newId()),
            at: deps.clock.now(),
            instanceId: inst.id,
            stepExecId,
            actorRole,
          });
          await deps.notifier.humanGateOpened(inst.id, stepExecId, actorRole);
        } else {
          await emit({
            type: "StepValidated",
            eventId: asEventId(deps.ids.newId()),
            at: deps.clock.now(),
            instanceId: inst.id,
            stepExecId,
            by: "auto",
          });
        }
        return;
      }

      deps.logger.info(`[wf:runner] ${step.kind} → produced artifact=${outcome.artifact.id.slice(0, 8)} kind=${outcome.artifact.kind}`);

      if (declaredOutputs.length > 1) {
        throw new Error(
          `runner-shape-mismatch: ${step.kind} declared ${declaredOutputs.length} outputs but returned a single 'produced' outcome (use 'produced-many')`,
        );
      }
      // `loop.foreach` is special-cased: the runner emits a list artifact
      // (kind = PathList/MarkdownList) that does not match the declared
      // single-item output kind. We skip the kind/schema check, persist the
      // list artifact at the declared slot (for replay), then materialize
      // per-iteration unit artifacts and emit one `IterationStarted` per
      // item. Downstream resolution routes through those records (see
      // `loadFromTransition`).
      const isForeach = step.kind === "loop.foreach";
      if (!isForeach) {
        await assertProducedArtifactConforms(
          runner,
          step.kind,
          outcome.artifact,
          step.config,
        );
      }
      const port = declaredOutputs[0]?.name ?? "out";
      await emit({
        type: "StepProducedArtifact",
        eventId: asEventId(deps.ids.newId()),
        at: deps.clock.now(),
        instanceId: inst.id,
        stepExecId,
        artifactId: outcome.artifact.id,
        port,
      });
      await maybeAssignVariable(port, outcome.artifact.id);
      if (isForeach) {
        await materializeForeachIterations(
          inst,
          template,
          step.id,
          stepExecId,
          outcome.artifact.id,
        );
      }
      if (step.humanGateRequired) {
        const cfgRole = step.config["actorRole"];
        const actorRole =
          (typeof cfgRole === "string" ? cfgRole : undefined) ??
          step.actorRole ??
          "Developer";
        await emit({
          type: "StepAwaitingHumanGate",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId: inst.id,
          stepExecId,
          actorRole,
        });
        await deps.notifier.humanGateOpened(inst.id, stepExecId, actorRole);
      } else {
        await emit({
          type: "StepValidated",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId: inst.id,
          stepExecId,
          by: "auto",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.logger.error(`[wf:runner] ${step.kind} FAILED exec=${stepExecId.slice(0, 8)}: ${message}`);
      await emit({
        type: "StepFailed",
        eventId: asEventId(deps.ids.newId()),
        at: deps.clock.now(),
        instanceId: inst.id,
        stepExecId,
        error: message,
      });
    }
  };

  /**
   * Reads the list artifact emitted by a `loop.foreach`, materializes one
   * unit artifact per item (kind = single-item kind), and emits one
   * `IterationStarted` per index. Called between the foreach's
   * `StepProducedArtifact` and its `StepValidated`.
   */
  const materializeForeachIterations = async (
    inst: InstanceState,
    template: WorkflowTemplate,
    loopStepId: StepId,
    loopStepExecId: StepExecId,
    listArtifactId: ArtifactId,
  ): Promise<void> => {
    void inst;
    void template;
    const { meta, content } = await deps.artifactStore.get(listArtifactId);
    let payload: ArtifactPayload<ArtifactKind> | null = null;
    try {
      payload = JSON.parse(content) as ArtifactPayload<ArtifactKind>;
    } catch {
      // fall back to plainFallback below
    }
    // Materialize one unit artifact per item. Legacy `MarkdownList`/`PathList`
    // carry `{ bodies }` / `{ paths }` (strings → Markdown/Path payloads); the
    // canonical `List<T>` carries `{ items: ElementPayload[] }` (already typed
    // `T` payloads, emitted verbatim).
    const itemMeta = {
      source: "loop.foreach",
      loopStepId,
      loopStepExecId,
    } as const;
    const itemArtifacts: Artifact[] = [];
    if (meta.kind === "PathList") {
      const list = payload as ArtifactPayload<"PathList"> | null;
      const paths = list && Array.isArray(list.paths) ? list.paths : [];
      for (let i = 0; i < paths.length; i += 1) {
        itemArtifacts.push(
          await putArtifactPayload(
            deps.artifactStore,
            "Path",
            { path: paths[i] } satisfies ArtifactPayload<"Path">,
            { ...itemMeta, iterationIndex: String(i) },
          ),
        );
      }
    } else if (meta.kind === "MarkdownList") {
      const list = payload as ArtifactPayload<"MarkdownList"> | null;
      const bodies = list && Array.isArray(list.bodies) ? list.bodies : [];
      for (let i = 0; i < bodies.length; i += 1) {
        itemArtifacts.push(
          await putArtifactPayload(
            deps.artifactStore,
            "Markdown",
            { format: "markdown", body: bodies[i] } satisfies ArtifactPayload<"Markdown">,
            { ...itemMeta, iterationIndex: String(i) },
          ),
        );
      }
    } else if (isContainerArtifactKind(meta.kind)) {
      const innerKind = parseListArtifactKind(meta.kind);
      if (!innerKind) {
        throw new Error(`loop.foreach: malformed list kind ${meta.kind}`);
      }
      const list = payload as { items?: unknown } | null;
      const elements =
        list && Array.isArray(list.items) ? list.items : [];
      for (let i = 0; i < elements.length; i += 1) {
        itemArtifacts.push(
          await putArtifactPayload(
            deps.artifactStore,
            innerKind,
            elements[i] as ArtifactPayload<ArtifactKind>,
            { ...itemMeta, iterationIndex: String(i) },
          ),
        );
      }
    } else {
      throw new Error(
        `loop.foreach: unexpected list artifact kind ${meta.kind} (expected MarkdownList, PathList or List<T>)`,
      );
    }
    for (let i = 0; i < itemArtifacts.length; i += 1) {
      const itemArtifact = itemArtifacts[i];
      await emit({
        type: "IterationStarted",
        eventId: asEventId(deps.ids.newId()),
        at: deps.clock.now(),
        instanceId: inst.id,
        loopStepId,
        loopStepExecId,
        iterationKey: buildIterationKey(loopStepId, i),
        index: i,
        itemArtifactId: itemArtifact.id,
      });
    }
  };

  /**
   * Counts iterations of a given in-scope step that have reached `validated`.
   * Used to decide whether `loop.collect` can fire.
   */
  const countValidatedIterations = (
    inst: InstanceState,
    stepId: StepId,
    foreachStepId: StepId,
  ): number => {
    const records = inst.iterations.get(foreachStepId) ?? [];
    const validKeys = new Set(records.map((r) => r.iterationKey));
    return inst.executions.filter(
      (e) =>
        e.stepId === stepId &&
        e.status === "validated" &&
        e.iterationKey !== undefined &&
        validKeys.has(e.iterationKey),
    ).length;
  };

  /**
   * Walks forward from a branching exec and emits `StepSkipped` for every
   * step that can only be reached through one of the unproduced ports.
   *
   * A downstream step S is skipped iff **every** one of its incoming non-loop
   * transitions is "dead via this branch":
   *  - the transition's source is the branch step AND its `fromPort` is not
   *    in `branchExec.outputs.keys()`,
   *  - OR the transition's source is itself in the skipped closure.
   *
   * A convergence point (some incoming edges alive, some dead) is **not**
   * skipped — its alive parents will eventually validate and `afterValidated`
   * will call `maybeStartConvergent` for it.
   */
  const propagateSkip = async (
    inst: InstanceState,
    template: WorkflowTemplate,
    branchExec: StepExecution,
    skippedEdges: ReadonlyArray<Transition>,
    takenEdges: ReadonlyArray<Transition>,
  ): Promise<void> => {
    void inst;
    const aliveTargets = new Set(takenEdges.map((e) => e.to));
    const producedPorts = new Set(branchExec.outputs.keys());

    // Memoized recursion: "is `stepId` in the dead-via-this-branch closure?"
    // The graph is a DAG over non-loop edges (validated by `validateTemplate`),
    // so the recursion terminates.
    const memo = new Map<StepId, boolean>();
    memo.set(branchExec.stepId, false); // the branch itself is alive
    const isDead = (stepId: StepId): boolean => {
      const cached = memo.get(stepId);
      if (cached !== undefined) return cached;
      const incoming = template.transitions.filter(
        (t) => !t.isLoop && t.to === stepId,
      );
      if (incoming.length === 0) {
        memo.set(stepId, false);
        return false;
      }
      // Optimistic mark to break any unexpected cycle defensively.
      memo.set(stepId, true);
      let allDead = true;
      for (const edge of incoming) {
        const upstreamDead =
          edge.from === branchExec.stepId
            ? edge.fromPort
              ? !producedPorts.has(edge.fromPort)
              : false // no fromPort on a branch edge — treat as alive
            : isDead(edge.from);
        if (!upstreamDead) {
          allDead = false;
          break;
        }
      }
      memo.set(stepId, allDead);
      return allDead;
    };

    // Forward BFS from the branch over non-loop edges to enumerate every
    // candidate step, then classify each. Emit `StepSkipped` in BFS order so
    // the event log reads top-down.
    const reachable: StepId[] = [];
    const visited = new Set<StepId>();
    const queue: StepId[] = [branchExec.stepId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const edge of successors(template, cur)) {
        if (!visited.has(edge.to)) {
          reachable.push(edge.to);
          queue.push(edge.to);
        }
      }
    }

    const chosenPort = [...producedPorts][0] ?? "";
    const dedup = new Set<StepId>();
    for (const stepId of reachable) {
      if (dedup.has(stepId)) continue;
      dedup.add(stepId);
      if (aliveTargets.has(stepId)) continue;
      if (!isDead(stepId)) continue;
      const stepDef = findStep(template, stepId);
      await emit({
        type: "StepSkipped",
        eventId: asEventId(deps.ids.newId()),
        at: deps.clock.now(),
        instanceId: branchExec.instanceId,
        stepExecId: asStepExecId(deps.ids.newId()),
        stepId,
        kind: stepDef.kind,
        cause: {
          branchStepId: branchExec.stepId,
          branchStepExecId: branchExec.id,
          chosenPort,
        },
        iterationKey: branchExec.iterationKey,
      });
    }
    void skippedEdges;
  };

  /**
   * Starts `stepId` only when every one of its incoming non-loop transitions
   * has been resolved (the upstream step is either `validated` or `skipped`).
   * For non-convergent steps (1 incoming edge) this collapses to a plain
   * `startStep` call.
   *
   * If every incoming edge resolves to a `skipped` upstream OR a `validated`
   * upstream that produced on a port other than this edge's `fromPort`, the
   * convergent step itself is part of the dead subgraph: emit `StepSkipped`
   * and propagate downstream.
   */
  const maybeStartConvergent = async (
    inst: InstanceState,
    template: WorkflowTemplate,
    stepId: StepId,
    loopFrom?: StepExecId,
    iterationKey?: string,
  ): Promise<void> => {
    const incoming = template.transitions.filter(
      (t) => !t.isLoop && t.to === stepId,
    );
    if (incoming.length <= 1) {
      await startStep(inst, template, stepId, loopFrom, iterationKey);
      return;
    }

    const findUpstreamExec = (edge: Transition) =>
      [...inst.executions]
        .reverse()
        .find(
          (e) =>
            e.stepId === edge.from &&
            iterationKeyMatches(e.iterationKey, iterationKey),
        );

    type EdgeState = "unresolved" | "alive" | "dead";
    const classify = (edge: Transition): EdgeState => {
      const upstreamExec = findUpstreamExec(edge);
      if (!upstreamExec) return "unresolved";
      if (upstreamExec.status === "skipped") return "dead";
      if (upstreamExec.status !== "validated") return "unresolved";
      // Validated upstream: alive iff it produced on this edge's port.
      if (!edge.fromPort) {
        return upstreamExec.outputs.size > 0 ? "alive" : "dead";
      }
      return upstreamExec.outputs.has(edge.fromPort) ? "alive" : "dead";
    };

    const states = incoming.map(classify);
    if (states.some((s) => s === "unresolved")) return;

    if (states.every((s) => s === "dead")) {
      // The convergent step itself is dead — synthesize a `StepSkipped`.
      // Look for the closest upstream branch on any of the dead edges for
      // the `cause` payload (best-effort; the UI can fall back to the
      // generic message if the branch is not found).
      const closestDeadBranch = incoming.find((edge) => {
        const u = findUpstreamExec(edge);
        if (!u) return false;
        return u.status === "validated" || u.status === "skipped";
      });
      const upstreamExec = closestDeadBranch
        ? findUpstreamExec(closestDeadBranch)
        : undefined;
      const stepDef = findStep(template, stepId);
      await emit({
        type: "StepSkipped",
        eventId: asEventId(deps.ids.newId()),
        at: deps.clock.now(),
        instanceId: inst.id,
        stepExecId: asStepExecId(deps.ids.newId()),
        stepId,
        kind: stepDef.kind,
        cause: {
          branchStepId: upstreamExec?.stepId ?? stepId,
          branchStepExecId: upstreamExec?.id ?? asStepExecId(deps.ids.newId()),
          chosenPort: upstreamExec
            ? [...upstreamExec.outputs.keys()][0] ?? ""
            : "",
        },
        iterationKey,
      });
      // Cascade downstream: re-evaluate every successor via maybeStartConvergent.
      const refreshed = deps.state.getInstance(inst.id) ?? inst;
      for (const edge of successors(template, stepId)) {
        await maybeStartConvergent(
          refreshed,
          template,
          edge.to,
          undefined,
          iterationKey,
        );
      }
      return;
    }

    // At least one alive incoming → start the convergent step normally.
    await startStep(inst, template, stepId, loopFrom, iterationKey);
  };

  /**
   * §5a — spawn-and-suspend for a `template.invoke` step. Resolves the child
   * template from the run's frozen snapshot (§7), seeds the child's `input`
   * variables from the parent's variables via the step's `readsFrom`, emits
   * `ChildInstanceSpawned` (which flips this step to `awaitingChild`) and the
   * child's `InstanceStarted` with inherited channel / cwd / depth / snapshot.
   * Throws (→ `StepFailed`) on a missing binding or a depth-bound breach (§14).
   */
  const spawnChildInstance = async (
    inst: InstanceState,
    step: StepDef,
    stepExecId: StepExecId,
  ): Promise<void> => {
    // §14 runtime depth guard: refuse before emitting any spawn event. Throwing
    // lands in startStep's catch → StepFailed on the parent step.
    if (inst.depth + 1 > MAX_INVOCATION_DEPTH) {
      throw new Error("max invocation depth exceeded");
    }
    const ref = readTemplateInvokeRef(step);
    const key = templateInvokeRefKey(ref);
    // §7: reuse the snapshot frozen at root start so a mid-run republish can't
    // swap versions. Fall back to the live registry only when the run predates
    // the snapshot (defensive — should not happen for a snapshotted root).
    const childTemplate =
      inst.templateSnapshots?.get(key) ??
      (await deps.templates.resolve(ref.templateId, ref.templateVersion));

    // Resolve seeds: each child `input` variable is bound, via the step's
    // readsFrom, to a parent variable whose artifact we forward by reference.
    const seedBindings: { variableName: string; artifactId: ArtifactId }[] = [];
    for (const v of childTemplate.variables) {
      if (v.role !== "input") continue;
      const parentVarName = step.readsFrom?.[v.name];
      if (!parentVarName) {
        throw new Error(
          `template.invoke ${step.id}: input "${v.name}" is not bound (readsFrom)`,
        );
      }
      const artifactId = inst.variables.get(parentVarName);
      if (!artifactId) {
        throw new Error(
          `template.invoke ${step.id}: parent variable "${parentVarName}" has no artifact to seed input "${v.name}"`,
        );
      }
      seedBindings.push({ variableName: v.name, artifactId });
    }

    const childInstanceId = asWorkflowId(deps.ids.newId());

    // §5a: mark the suspension first — `ChildInstanceSpawned` flips the parent
    // step to `awaitingChild` in the projection.
    await emit({
      type: "ChildInstanceSpawned",
      eventId: asEventId(deps.ids.newId()),
      at: deps.clock.now(),
      instanceId: inst.id,
      stepExecId,
      childInstanceId,
      childTemplateId: ref.templateId,
      childTemplateVersion: ref.templateVersion,
      seedBindings,
    });

    // Pre-assign the child's own `defaultValue` variables (parity with
    // makeStartInstance), then overlay the parent-provided input seeds so a
    // bound input always wins over a default.
    const variableDefaults: { name: string; artifactId: ArtifactId }[] = [];
    const seededNames = new Set(seedBindings.map((b) => b.variableName));
    for (const v of childTemplate.variables) {
      if (v.defaultValue === undefined) continue;
      if (seededNames.has(v.name)) continue;
      const a = await deps.artifactStore.put(v.kind, v.defaultValue, { role: "seed" });
      variableDefaults.push({ name: v.name, artifactId: a.id });
    }
    for (const b of seedBindings) {
      variableDefaults.push({ name: b.variableName, artifactId: b.artifactId });
    }

    // §8: child inherits the parent cwd unless the step overrides it.
    const cfgCwd = step.config["cwd"];
    const childCwd =
      (typeof cfgCwd === "string" && cfgCwd.trim() ? cfgCwd.trim() : undefined) ??
      inst.cwd;

    // §7: children inherit the parent's frozen snapshot verbatim (it is the
    // transitive closure of the root), so they resolve their own children
    // without re-querying the registry.
    const snapshotArray = inst.templateSnapshots
      ? [...inst.templateSnapshots].map(([r, t]) => ({ ref: r, template: t }))
      : undefined;

    // §5a + §13: emit the child's InstanceStarted directly (not via
    // makeStartInstance) so it inherits the parent's channelId, cwd, depth and
    // snapshot. Pin the frozen child template as effectiveTemplate so replay is
    // deterministic and a republish can't swap the version mid-run.
    await emit({
      type: "InstanceStarted",
      eventId: asEventId(deps.ids.newId()),
      at: deps.clock.now(),
      instanceId: childInstanceId,
      templateId: ref.templateId,
      templateVersion: ref.templateVersion,
      seed: [],
      ...(variableDefaults.length ? { variableDefaults } : {}),
      ...(childCwd ? { cwd: childCwd } : {}),
      effectiveTemplate: childTemplate,
      channelId: inst.channelId,
      depth: inst.depth + 1,
      parent: { instanceId: inst.id, stepExecId },
      ...(snapshotArray && snapshotArray.length
        ? { templateSnapshots: snapshotArray }
        : {}),
    });
  };

  /**
   * §5b — wakes the parent step suspended on a `template.invoke` once its child
   * reaches a terminal state. Captures the child's `output` variables, emits
   * `ChildInstanceCompleted`, then (on success) routes those outputs onto the
   * parent step's output slots + mapped variables and validates the step so the
   * parent advances. Idempotent (§16): a no-op once the parent step has already
   * left `awaitingChild`.
   */
  const completeChildOnParent = async (
    childInstanceId: WorkflowId,
    outcome: "completed" | "failed",
    error?: string,
  ): Promise<void> => {
    const child = deps.state.getInstance(childInstanceId);
    if (!child?.parent) return;
    const { instanceId: parentId, stepExecId } = child.parent;
    const parent = deps.state.getInstance(parentId);
    if (!parent) return;
    const parentExec = parent.executions.find((e) => e.id === stepExecId);
    if (!parentExec || parentExec.status !== "awaitingChild") return;

    // Capture the child's output variables at terminal time (§4) so the parent
    // reducer never peeks into the child's projected state at replay.
    const outputs: { variableName: string; artifactId: ArtifactId }[] = [];
    if (outcome === "completed") {
      const childTemplate = await templateForInstance(child);
      for (const v of childTemplate.variables) {
        if (v.role !== "output") continue;
        const aid = child.variables.get(v.name);
        if (aid) outputs.push({ variableName: v.name, artifactId: aid });
      }
    }

    await emit({
      type: "ChildInstanceCompleted",
      eventId: asEventId(deps.ids.newId()),
      at: deps.clock.now(),
      instanceId: parentId,
      stepExecId,
      childInstanceId,
      outputs,
      outcome,
      ...(error ? { error } : {}),
    });

    // On failure the projection already failed the parent step + instance; the
    // StepFailed/InstanceCompleted listener then propagates to any grandparent.
    if (outcome === "failed") return;

    // §5b: route child outputs onto the parent step's slots (so downstream
    // transitions resolve), assign the mapped parent variables, then validate.
    const parentTemplate = await templateForInstance(parent);
    const parentStep = findStep(parentTemplate, parentExec.stepId);
    for (const out of outputs) {
      await emit({
        type: "StepProducedArtifact",
        eventId: asEventId(deps.ids.newId()),
        at: deps.clock.now(),
        instanceId: parentId,
        stepExecId,
        artifactId: out.artifactId,
        port: out.variableName,
      });
      const parentVarName = parentStep.writesTo?.[out.variableName];
      if (parentVarName) {
        await emit({
          type: "VariableAssigned",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId: parentId,
          stepExecId,
          variableName: parentVarName,
          artifactId: out.artifactId,
        });
      }
    }
    await emit({
      type: "StepValidated",
      eventId: asEventId(deps.ids.newId()),
      at: deps.clock.now(),
      instanceId: parentId,
      stepExecId,
      by: "auto",
    });
  };

  /**
   * Schedules a parent wake under the PARENT's serializer lock — several
   * children (a parallel foreach) may terminate concurrently, each waking the
   * same parent instance on its own stepExecId; serializing avoids interleaved
   * emits (§Risques: inter-instance ordering).
   */
  const wakeParentOnChildTerminal = (
    childInstanceId: WorkflowId,
    outcome: "completed" | "failed",
    error?: string,
  ): void => {
    const child = deps.state.getInstance(childInstanceId);
    if (!child?.parent) return;
    schedule(child.parent.instanceId, () =>
      completeChildOnParent(childInstanceId, outcome, error),
    );
  };

  const afterValidated = async (instanceId: WorkflowId, stepExecId: StepExecId): Promise<void> => {
    const inst = deps.state.getInstance(instanceId);
    if (!inst) return;
    const exec = inst.executions.find((e) => e.id === stepExecId);
    if (!exec) return;
    const template = await templateForInstance(inst);
    if (isExit(template, exec.stepId)) {
      await emit({
        type: "InstanceCompleted",
        eventId: asEventId(deps.ids.newId()),
        at: deps.clock.now(),
        instanceId,
        finalArtifact: exec.outputArtifact,
      });
      return;
    }

    // Auto-loop: if this step produced on a single port that has an outgoing
    // `isLoop: true` transition, emit `LoopOpened` instead of cascading
    // forward. Currently only `llm.judge` opts into this — `validateTemplate`
    // enforces the whitelist at save time (see `validateAutoLoopWhitelist`).
    // See `specs/llm-judge-bounded-retries.md` §3.
    const step = findStep(template, exec.stepId);
    if (exec.outputs.size === 1) {
      const [producedPort] = [...exec.outputs.keys()];
      const loopEdges = template.transitions.filter(
        (t) => t.from === exec.stepId && t.isLoop && t.fromPort === producedPort,
      );
      if (loopEdges.length > 0) {
        const edge = loopEdges[0];
        const artifactId = exec.outputs.get(producedPort);
        if (artifactId) {
          const { content } = await deps.artifactStore.get(artifactId);
          await emit({
            type: "LoopOpened",
            eventId: asEventId(deps.ids.newId()),
            at: deps.clock.now(),
            instanceId,
            loopId: asLoopId(deps.ids.newId()),
            fromStepExec: exec.id,
            toStepId: edge.to,
            reason: extractDisplayableContent(content),
            comments: undefined,
            author: judgeLoopAuthor(exec.stepId),
          });
          return;
        }
      }
    }

    const edges = successors(template, exec.stepId);
    if (edges.length === 0) return;
    const refreshed = deps.state.getInstance(instanceId);
    if (!refreshed) return;

    // Foreach validation → fan out to the first internal step, once per
    // iteration record (each `startStep` call yields to the serializer between
    // iterations). In sequential mode (`config.sequential === true`) we only
    // start index 0 here — the remaining iterations are started one at a time
    // by the join hook below, after the prior iteration's body fully validates.
    if (step.kind === "loop.foreach") {
      const next = edges[0]?.to;
      const records = [...(refreshed.iterations.get(exec.stepId) ?? [])].sort(
        (a, b) => a.index - b.index,
      );
      if (records.length === 0) {
        // Empty array — short-circuit to whatever comes after the scope.
        const scopes = scopesOf(template);
        const collectId = scopes.collectOf.get(exec.stepId);
        if (collectId) {
          await startStep(refreshed, template, collectId);
        }
        return;
      }
      if (!next) return;
      const toStart = isSequentialForeach(step) ? records.slice(0, 1) : records;
      for (const rec of toStart) {
        const cur = deps.state.getInstance(instanceId) ?? refreshed;
        await startStep(cur, template, next, undefined, rec.iterationKey);
      }
      return;
    }

    // Determine which outgoing edges to take based on this step's produced
    // ports. For non-branching steps (single output, or produced-many with
    // every port filled), all edges are taken. For branching steps
    // (`produced-on-port`), only edges matching a produced port are taken;
    // the others are skipped.
    const producedPorts = new Set(exec.outputs.keys());
    const taken: Transition[] = [];
    const skipped: Transition[] = [];
    for (const edge of edges) {
      if (!edge.fromPort) {
        // Single-output convention — validation guarantees no ambiguity
        // when the source has >1 outputs. Default: take.
        taken.push(edge);
        continue;
      }
      if (producedPorts.has(edge.fromPort)) {
        taken.push(edge);
      } else {
        skipped.push(edge);
      }
    }

    if (skipped.length > 0) {
      await propagateSkip(refreshed, template, exec, skipped, taken);
    }

    // In-scope step → next is the collect: join only when every iteration
    // has produced a `validated` exec. Done after the skip propagation so a
    // skipped collect is still emitted (defensive — branching inside a
    // foreach scope is rejected by `inferIterationScopes`).
    if (taken.length === 1) {
      const nextStepDef = findStep(template, taken[0].to);
      if (
        nextStepDef.kind === "loop.collect" &&
        exec.iterationKey !== undefined
      ) {
        const scopes = scopesOf(template);
        const foreachId = scopes.foreachOf.get(taken[0].to);
        if (!foreachId) return;
        const foreachStep = findStep(template, foreachId);
        const records = [...(refreshed.iterations.get(foreachId) ?? [])].sort(
          (a, b) => a.index - b.index,
        );

        // Sequential advance: the current iteration just reached the scope
        // boundary (its whole body — incl. any child template.invoke or
        // human.gate — has validated). Start the next iteration's body instead
        // of joining. The collect only fires once the LAST iteration arrives
        // (nextRec absent → fall through to the join below).
        if (isSequentialForeach(foreachStep)) {
          const idx = parseIterationIndex(exec.iterationKey);
          const nextRec = records.find((r) => r.index === idx + 1);
          if (nextRec) {
            const firstBody = successors(template, foreachId)[0]?.to;
            if (firstBody) {
              await startStep(
                refreshed,
                template,
                firstBody,
                undefined,
                nextRec.iterationKey,
              );
              return;
            }
          }
          // nextRec absent → this was the last iteration: fall into the join.
        }

        const done = countValidatedIterations(refreshed, exec.stepId, foreachId);
        if (done < records.length) {
          // Wait for more iterations to reach this point.
          return;
        }
        await startStep(refreshed, template, taken[0].to);
        return;
      }
    }

    // Default cascade — propagate iterationKey to keep the iteration aligned
    // through the body of the scope. Convergence handled by
    // `maybeStartConvergent`.
    for (const edge of taken) {
      const cur = deps.state.getInstance(instanceId) ?? refreshed;
      await maybeStartConvergent(
        cur,
        template,
        edge.to,
        undefined,
        exec.iterationKey,
      );
    }
  };

  const onLoopOpened = async (
    instanceId: WorkflowId,
    fromStepExec: StepExecId,
    toStepId: StepId,
    loopId: string,
  ): Promise<void> => {
    const inst = deps.state.getInstance(instanceId);
    if (!inst) return;
    const template = await templateForInstance(inst);
    const fromExec = inst.executions.find((e) => e.id === fromStepExec);
    const iterationKey = fromExec?.iterationKey;
    await startStep(inst, template, toStepId, fromStepExec, iterationKey);
    await emit({
      type: "LoopClosed",
      eventId: asEventId(deps.ids.newId()),
      at: deps.clock.now(),
      instanceId,
      loopId: loopId as never,
    });
  };

  let unsub: (() => void) | null = null;

  const schedule = (instanceId: WorkflowId, fn: () => Promise<void>) => {
    void serialize(instanceId, fn).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      deps.logger.error(`[wf] orchestrator error: ${message}`);
    });
  };

  /**
   * Boot-time recovery. A step is driven by an in-memory `await` (the runner
   * promise); a process restart loses it. The event log is replayed into the
   * read model, but a step left mid-flight shows up as `status: "running"`
   * with no terminal event — and nothing re-drives it, since the orchestrator
   * only reacts to new `InstanceStarted` / `StepValidated` / `LoopOpened`
   * events. Such a step would stay stuck forever (and, for a non-idempotent
   * `claude_code.invoke`, must not be silently re-run). We mark each orphan
   * failed so its instance reaches a terminal `failed` state the user can see
   * and restart, instead of an eternal `running`.
   */
  const reconcileOrphanedRunningSteps = async (): Promise<void> => {
    for (const instanceId of deps.state.listInstanceIds()) {
      const inst = deps.state.getInstance(instanceId);
      if (!inst) continue;
      for (const exec of inst.executions) {
        if (exec.status !== "running") continue;
        deps.logger.warn(
          `[wf] reconciling orphaned running step exec=${exec.id.slice(0, 8)} (${exec.stepId}) in instance ${instanceId.slice(0, 8)} → failed`,
        );
        await emit({
          type: "StepFailed",
          eventId: asEventId(deps.ids.newId()),
          at: deps.clock.now(),
          instanceId,
          stepExecId: exec.id,
          error:
            "Step was interrupted by an app restart while running and cannot be resumed. Restart the workflow.",
        });
      }
    }
  };

  /**
   * Boot-time recovery for `template.invoke` (§16). The parent wake (§5b) is a
   * *live* reaction to the child's terminal event; a crash between the child's
   * `InstanceCompleted`/`StepFailed` (persisted) and the `ChildInstanceCompleted`
   * (never emitted) leaves the parent suspended forever. After re-hydration this
   * pass re-links every terminal child whose parent is still `awaitingChild`.
   * Idempotent: `completeChildOnParent` skips a parent that has already advanced,
   * so a second boot — where `ChildInstanceCompleted` is already in the log —
   * emits nothing.
   */
  const reconcileOrphanedParents = async (): Promise<void> => {
    for (const instanceId of deps.state.listInstanceIds()) {
      const inst = deps.state.getInstance(instanceId);
      if (!inst?.parent) continue;
      if (inst.status !== "completed" && inst.status !== "failed") continue;
      const error =
        inst.status === "failed"
          ? inst.executions.find((e) => e.status === "failed")?.error
          : undefined;
      wakeParentOnChildTerminal(
        instanceId,
        inst.status === "failed" ? "failed" : "completed",
        error,
      );
    }
  };

  return {
    start(): void {
      if (unsub) return;
      unsub = deps.bus.subscribe((evt) => {
        switch (evt.type) {
          case "InstanceStarted":
            schedule(evt.instanceId, async () => {
              const inst = deps.state.getInstance(evt.instanceId);
              if (!inst) return;
              const template = await templateForInstance(inst);
              await startStep(inst, template, template.entryStep);
            });
            return;
          case "StepValidated":
            schedule(evt.instanceId, () => afterValidated(evt.instanceId, evt.stepExecId));
            return;
          case "LoopOpened":
            schedule(evt.instanceId, () =>
              onLoopOpened(evt.instanceId, evt.fromStepExec, evt.toStepId, evt.loopId),
            );
            return;
          case "InstanceCompleted":
            // §5b: a child instance completing wakes the parent's suspended
            // `template.invoke` step. A no-op for root instances (no parent).
            wakeParentOnChildTerminal(evt.instanceId, "completed");
            return;
          case "StepFailed": {
            // §5b: a step failure drives the whole instance to `failed`; if that
            // instance is a spawned child, propagate the failure to its parent's
            // suspended step (which itself may cascade to a grandparent).
            const inst = deps.state.getInstance(evt.instanceId);
            if (inst?.status === "failed" && inst.parent) {
              wakeParentOnChildTerminal(evt.instanceId, "failed", evt.error);
            }
            return;
          }
          default:
            return;
        }
      });
      // Fail any step orphaned in `running` by a previous process restart, then
      // re-link any parent left suspended on a child that already terminated
      // (§16) — both run after the subscription so their emitted events drive
      // the live reactions.
      void reconcileOrphanedRunningSteps()
        .then(() => reconcileOrphanedParents())
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          deps.logger.error(`[wf] orphan reconciliation error: ${message}`);
        });
    },
    stop(): void {
      if (unsub) {
        unsub();
        unsub = null;
      }
    },
  };
};
