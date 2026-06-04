/**
 * Contract for plug-in "step runners" — the strategy executed for a given
 * {@link StepKindId}. Adding a new step kind means implementing a
 * {@link StepRunner} and registering it on the {@link StepRunnerRegistry};
 * neither the domain nor the orchestrator needs to change.
 */
import type { Artifact, ArtifactKind } from "../domain/artifact";
import type { ArtifactPayload } from "../domain/artifact-schemas";
import type {
  ArtifactId,
  RunId,
  StepExecId,
  StepId,
  WorkflowId,
} from "../domain/ids";
import type { StepDef, StepKindId, TemplateVariable } from "../domain/template";
import type { ArtifactSchemaRegistry } from "./ports/outbound/artifact-schema-registry";
import type { ArtifactStore } from "./ports/outbound/artifact-store";
import type { ClockPort } from "./ports/outbound/clock";
import type { EnvironmentPort } from "./ports/outbound/environment";
import type { FileSystemPort } from "./ports/outbound/file-system";
import type { HashPort } from "./ports/outbound/hash";
import type { IdGenerator } from "./ports/outbound/id-generator";
import type { LlmSessionBus } from "./ports/outbound/event-bus";
import type { LinearGateway } from "./ports/outbound/linear-gateway";
import type { LLMGateway } from "./ports/outbound/llm-gateway";
import type { LoggerPort } from "./ports/outbound/logger";
import type { PathPort } from "./ports/outbound/path";
import type { RunLog } from "./ports/outbound/run-log";
import type { ShellGateway } from "./ports/outbound/shell-gateway";
import type { SkillRegistry } from "./ports/outbound/skill-registry";
import type { ParserRegistry } from "./ports/outbound/parser-registry";
import type { ParserRuntime } from "./ports/outbound/parser-runtime";

/** One prior attempt at a step, re-injected into the next prompt. */
export type LoopHistoryInput = {
  previousOutput: string;
  humanFeedback: {
    summary: string;
    comments: ReadonlyArray<{ startLine: number; endLine: number; body: string }>;
  };
};

/**
 * Context passed to every {@link StepRunner.run}. Composed by the orchestrator
 * from the current {@link InstanceState} and the outbound ports.
 */
/**
 * Input entry passed to a runner. `payload` is the parsed structured payload
 * (per {@link ArtifactSchemas}) when validation is on; `null` in log-only or
 * rollback mode — in which case the runner must defensively fall back to
 * `content` (the raw string as stored).
 */
export type RunContextInput = {
  /** Name of the port that received this artifact (matches `NodeSpec.inputs[].name`). */
  port: string;
  kind: ArtifactKind;
  /** Raw string content as stored — always present, useful for prompt building. */
  content: string;
  /** Parsed payload conforming to the descriptor's schema, or `null` when degraded. */
  payload: ArtifactPayload<ArtifactKind> | null;
  /**
   * Identifier of the source artifact in the store. Useful for runners that
   * need to reference an input in their output's metadata.
   */
  artifactId: ArtifactId;
};

export type RunContext = {
  instanceId: WorkflowId;
  stepExecId: StepExecId;
  stepId: StepId;
  step: StepDef;
  /**
   * Inputs loaded from the artifact store. In strict mode every entry has a
   * non-null `payload`; in log-only / rollback mode `payload` may be `null`.
   */
  inputs: ReadonlyArray<RunContextInput>;
  /** Feedback loops accumulated for this step (oldest first). */
  loopHistory: ReadonlyArray<LoopHistoryInput>;
  /**
   * Number of prior `looped` executions of this step (same `stepId`, same
   * `iterationKey`) in the current instance. Always `0` on the first run.
   * Read by `llm.judge` to decide between `rejected` and `exhausted`; ignored
   * by every other runner.
   */
  attempt: number;
  /**
   * Run-scoped state set by upstream side-effect steps (e.g. `workspace.set`).
   * `cwd` is the working directory native runners must use — currently
   * forwarded to the Claude CLI as its `cwd`.
   */
  workspace: { cwd?: string };
  /** Outbound ports the runner is allowed to use. */
  deps: {
    artifactStore: ArtifactStore;
    llm: LLMGateway;
    linear: LinearGateway;
    shell: ShellGateway;
    runLog: RunLog;
    clock: ClockPort;
    ids: IdGenerator;
    llmSession: LlmSessionBus;
    logger: LoggerPort;
    hash: HashPort;
    path: PathPort;
    environment: EnvironmentPort;
    fs: FileSystemPort;
    /**
     * Dynamic artifact-schema parser registry. Optional — runners that don't
     * need the active-parser pipeline (the vast majority) can ignore it.
     * `claude_code.invoke` reads it to simplify inputs before assembling the prompt.
     */
    parsers?: ParserRegistry;
    /** Parser runtime dispatcher (declarative now, QuickJS in Phase 3). */
    parserRuntime?: ParserRuntime;
    /**
     * Skill (prompt library) registry. Consumed by `skill.loader` to resolve
     * a saved prompt body and emit it as a Markdown artifact on the wire.
     * Optional — runners that don't reference the library can ignore it.
     */
    skills?: SkillRegistry;
    /**
     * Artifact-schema registry. Consumed by `format.validate` to validate a
     * subject's content against the schema of `config.expectedKind`. Optional —
     * the other runners ignore it.
     */
    artifactSchemas?: ArtifactSchemaRegistry;
  };
};

/**
 * Result of a runner. Three shapes are supported:
 *  - `produced`: the step produced an artifact and the orchestrator may
 *    advance (or auto-validate).
 *  - `produced-pending-human`: an artifact was produced AND the step expects
 *    human validation/feedback before advancing — used by `claude_code.invoke` with
 *    `humanGateRequired = true` so the side panel can show the full session
 *    plus the validation controls without an extra `human.gate` step.
 *  - `awaiting-human`: no artifact, the step is a pure pause (used by the
 *    standalone `human.gate` runner).
 */
/**
 * One artifact emitted to a named output slot. The orchestrator emits one
 * `StepProducedArtifact` event per entry (with the slot name) so the
 * projection can route the result back to `StepExecution.outputs.get(port)`.
 */
export type ProducedSlot = {
  port: string;
  artifact: Artifact;
};

export type StepOutcome =
  | {
      kind: "produced";
      artifact: Artifact;
      /** Optional list of {@link RunId}s associated with this outcome. */
      runs?: ReadonlyArray<RunId>;
    }
  | {
      /**
       * Multi-output result. Each `artifacts[*].port` must be declared in
       * `outputs[*].name` — emitting an undeclared port is a
       * `StepFailed(runner-shape-mismatch)`. Coverage may be partial: a
       * declared port absent from the slots is treated as non-produced and
       * skip-propagated to the downstream steps reachable only through it
       * (same routing as `produced-on-port`). This lets a runner branch
       * across several ports while still emitting independent artifacts on
       * the always-present ports (e.g. `shell.exec`: `success` XOR `failure`,
       * plus `stdout` + `stderr`).
       */
      kind: "produced-many";
      artifacts: ReadonlyArray<ProducedSlot>;
      runs?: ReadonlyArray<RunId>;
    }
  | {
      /**
       * Selective multi-output: the runner declared N output ports but
       * chose to emit on exactly one — the others are intentionally absent.
       * The orchestrator routes the artifact to `port` and emits
       * `StepSkipped` for every downstream step that is only reachable
       * through one of the unproduced ports.
       *
       * Shape-check at runtime: `port` MUST be one of the declared
       * `outputs[*].name`, otherwise `StepFailed(runner-shape-mismatch)`.
       */
      kind: "produced-on-port";
      port: string;
      artifact: Artifact;
      runs?: ReadonlyArray<RunId>;
    }
  | {
      kind: "produced-pending-human";
      artifact: Artifact;
      runs?: ReadonlyArray<RunId>;
      actorRole: string;
    }
  | { kind: "awaiting-human"; actorRole: string }
  | {
      /**
       * Pure side-effect on the run's workspace: no artifact produced, the
       * orchestrator emits `WorkspaceChanged` and auto-validates the step.
       */
      kind: "workspace-set";
      cwd: string;
    }
  | {
      /**
       * The runner is a `template.invoke` (`sub-template-invoke.md` §2): it does
       * not produce an artifact itself, it asks the orchestrator to spawn a
       * **child instance** of the referenced sub-template and suspend this step
       * in `awaitingChild`. The orchestrator resolves the child's seeds from the
       * step's `readsFrom`, emits `ChildInstanceSpawned` + the child's
       * `InstanceStarted`, and resumes the step on `ChildInstanceCompleted`
       * (§5). Returned verbatim from `run()` so the runner stays pure — every
       * event-log side-effect is materialized by the orchestrator, which owns
       * the journal.
       */
      kind: "spawned-child";
      config: Readonly<Record<string, unknown>>;
    };

/**
 * Matcher accepted in {@link PortSpec.kinds}: a concrete {@link ArtifactKind}
 * or the `"*"` sentinel (accepts any kind, ComfyUI passthrough style). An
 * actual stored artifact always has a concrete kind, never `"*"`.
 */
export type PortKindMatcher = ArtifactKind | "*";

export type PortSpec = {
  /** Logical name of the port (unique per node). */
  name: string;
  /**
   * Union of accepted kinds (must be non-empty).
   * - Single kind = monomorphic port.
   * - Multiple kinds = polymorphic port; the runner dispatches on
   *   `inputs[i].kind`.
   * - `["*"]` = wildcard, accepts any kind (debug / passthrough).
   */
  kinds: ReadonlyArray<PortKindMatcher>;
  /** If true, the step may run without this input being wired. */
  optional?: boolean;
  /**
   * If true, the port accepts **N incoming non-loop transitions** converging
   * on the same handle. The orchestrator delivers them as N
   * `RunContextInput` entries sharing `port === this.name`, ordered by
   * `Transition.order` ascending (then by creation index for ties). If a
   * `readsFrom[port]` is also defined, the variable's artifact is prepended
   * (order: −∞). Mirrors ComfyUI's `INPUT_IS_LIST`.
   */
  isList?: boolean;
  /**
   * UI hint: marks this port as the node's canonical input — the one users
   * are expected to wire most often. Purely cosmetic (no orchestrator effect):
   * the renderer highlights it so multi-input nodes read at a glance. At most
   * one input should set this; if none does, the UI falls back to "no primary
   * emphasis" rather than picking `inputs[0]` automatically.
   */
  primary?: boolean;
};

/**
 * Named output slot of a node. `name` is required: it serves as the stable
 * anchor referenced by `Transition.fromPort` and is persisted in events for
 * replay safety. Convention for monomorphic runners: use `name: "out"`.
 */
export type OutputPort = {
  kind: ArtifactKind;
  name: string;
  /** Description shown as tooltip on hover (UI). */
  description?: string;
  /**
   * UI hint: marks this output as the node's canonical product (mirror of
   * {@link PortSpec.primary} on the input side). Same semantics: cosmetic
   * only, at most one output should set it.
   */
  primary?: boolean;
};

export type NodeSpec = {
  /** Human-readable label (UI). */
  title: string;
  /** Short description for tooltips. */
  description?: string;
  /**
   * Input ports in stable order (used by the UI).
   *
   * Multi-input is supported: a runner may declare N ports, each typed
   * independently. A port may also be `isList: true`, in which case it
   * accepts N incoming non-loop transitions converging on that port (the
   * orchestrator passes them as N `RunContextInput` entries sharing
   * `port === port.name`, sorted by `Transition.order` ascending).
   * Polymorphism *within* a port (`kinds.length > 1`) is independent.
   */
  inputs: ReadonlyArray<PortSpec>;
  /**
   * Output slots in declaration order (drives UI handle stacking and the
   * default `fromPort` for `produced` outcomes).
   *
   * - `[]` = side-effect node (formerly `output: null`); pair with
   *   `passthrough: true` if outgoing transitions should still be allowed as
   *   execution-only wires.
   * - `[{ kind, name }]` = classic monomorphic node (default `name: "out"`).
   * - `[{ kind, name: "title" }, { kind, name: "description" }, …]` =
   *   multi-output node. Each entry must have a unique `name`.
   *
   * `passthrough` (rather than `outputs.length === 0`) distinguishes pure
   * side-effect nodes that emit no artifact but stay chainable from nodes
   * that just happen to have no outputs declared yet.
   */
  outputs: ReadonlyArray<OutputPort>;
  /**
   * Side-effect "command" nodes set this to `true` to declare that even
   * though they produce no artifact (`outputs: []`), their outgoing
   * transitions are **execution-only wires** — the downstream step's input is
   * resolved by the orchestrator from the previous data-producing ancestor
   * (cf. `previousDataStepId`). `validateTemplatePorts` skips type checking
   * on these transitions; the UI renders a passthrough source handle.
   */
  passthrough?: boolean;
};

/**
 * Subset of {@link WorkflowTemplate} passed to template-aware runners at
 * `resolveSpec` time. Optional everywhere (`listNodeSpecs` calls without a
 * template; runners that don't need it ignore it). Kept around so future
 * polymorphic runners can derive their port kinds from the declared
 * template variables without taking a dependency on the full template type.
 */
export type ResolveSpecTemplate = {
  variables: ReadonlyArray<TemplateVariable>;
};

export type ResolveSpecContext = {
  config: Readonly<Record<string, unknown>>;
  /**
   * Present when the caller has access to the surrounding template (validation,
   * orchestrator, `listNodeSpecs` invoked from the template editor). Absent in
   * the "catalogue" call from `listNodeSpecs()` with no template context —
   * runners that depend on it should fall back to a permissive signature
   * rather than throw, so the node picker can still show the kind.
   */
  template?: ResolveSpecTemplate;
};

/**
 * Implemented by every step-kind plug-in. Must be side-effect free aside from
 * the explicitly injected ports.
 */
export interface StepRunner {
  readonly kind: StepKindId;
  /**
   * Resolves the node signature for a given step config. Pure (no IO).
   * Called by `validateTemplatePorts`, the orchestrator (pre/post-run checks)
   * and the renderer (template editor).
   *
   * Monomorphic runners ignore `step.config` and return a constant.
   * Polymorphic runners read `step.config.outputKind` (or other discriminators)
   * and throw if the config is incomplete. Template-aware runners read
   * `ctx.template?.variables` to derive their kinds from a referenced variable.
   */
  resolveSpec(ctx: ResolveSpecContext): NodeSpec;
  run(ctx: RunContext): Promise<StepOutcome>;
}

/**
 * Registry mapping {@link StepKindId} to its runner. Orchestrator calls
 * {@link StepRunnerRegistry.resolve} at each `StepStarted` event.
 */
export interface StepRunnerRegistry {
  register(runner: StepRunner): void;
  /**
   * Removes the runner for `kind`, if any. Used by the plugin loader to clean
   * up contributions when a plugin is unloaded or disabled at runtime.
   * Returns `true` if a runner was actually removed.
   */
  unregister(kind: StepKindId): boolean;
  /** Throws if no runner is registered for `kind`. */
  resolve(kind: StepKindId): StepRunner;
  /** Snapshot of all registered kinds (used to enumerate node specs). */
  listKinds(): ReadonlyArray<StepKindId>;
}

/** In-memory registry; registration is idempotent (later wins). */
export const createStepRunnerRegistry = (): StepRunnerRegistry => {
  const runners = new Map<StepKindId, StepRunner>();
  return {
    register(runner: StepRunner): void {
      runners.set(runner.kind, runner);
    },
    unregister(kind: StepKindId): boolean {
      return runners.delete(kind);
    },
    resolve(kind: StepKindId): StepRunner {
      const r = runners.get(kind);
      if (!r) throw new Error(`no runner registered for kind: ${kind}`);
      return r;
    },
    listKinds(): ReadonlyArray<StepKindId> {
      return [...runners.keys()];
    },
  };
};

/**
 * Groups a flat `RunContext.inputs` array by port name. Useful for runners
 * with multi-input or `isList` ports that want to handle each logical port
 * independently. Ordering within a port matches the flat input order, which
 * the orchestrator guarantees to be `Transition.order` ascending.
 */
export const groupInputsByPort = (
  inputs: ReadonlyArray<RunContextInput>,
): Map<string, RunContextInput[]> => {
  const out = new Map<string, RunContextInput[]>();
  for (const input of inputs) {
    const bucket = out.get(input.port) ?? [];
    bucket.push(input);
    out.set(input.port, bucket);
  }
  return out;
};

export type { ArtifactId };
