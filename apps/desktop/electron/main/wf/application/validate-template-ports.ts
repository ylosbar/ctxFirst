/**
 * Port-typing validation for a {@link WorkflowTemplate}. Lives in the
 * application layer (rather than `domain/template.ts`) because it depends on
 * the {@link StepRunnerRegistry} to resolve each step's runtime signature.
 *
 * The split mirrors the spec: `validateTemplate` (structural, dependency-free)
 * is callable from seeds at module-load time; this one is called from
 * `save-template` and `validateBuiltinSeeds` once the registry exists.
 */
import {
  portAccepts,
  type RefinementParentResolver,
} from "@shared/wf/port-accepts";
import {
  findStep,
  TemplatePortError,
  type Transition,
  type WorkflowTemplate,
} from "../domain/template";
import type { StepId } from "../domain/ids";
import {
  inferIterationScopes,
  IterationScopeError,
} from "../domain/services/iteration-scopes";
import type {
  NodeSpec,
  PortSpec,
  StepRunnerRegistry,
} from "./step-runner";
import type { ArtifactSchemaRegistry } from "./ports/outbound/artifact-schema-registry";

/**
 * Builds the {@link RefinementParentResolver} that `portAccepts` uses to
 * walk the `extends` chain (§2) and to compare structural hashes (§5). The
 * registry's `resolve` returns the full descriptor; this projection trims
 * it down to the two fields the predicate reads, which keeps the resolver
 * tiny when threaded through the renderer over IPC mirrors.
 */
export const buildRefinementResolver = (
  artifactSchemas: ArtifactSchemaRegistry,
): RefinementParentResolver =>
  (kind) => {
    const rec = artifactSchemas.resolve(kind as never);
    return rec
      ? {
          extends: rec.extends ?? null,
          structuralHash: rec.structuralHash,
        }
      : null;
  };

const resolveSpecSafe = (
  registry: StepRunnerRegistry,
  step: { id: string; kind: string; config: Readonly<Record<string, unknown>> },
  template: WorkflowTemplate,
): NodeSpec => {
  try {
    return registry
      .resolve(step.kind)
      .resolveSpec({ config: step.config, template: { variables: template.variables } });
  } catch (err) {
    throw new TemplatePortError(
      `step ${step.id} (${step.kind}) failed resolveSpec: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
};

/**
 * Asserts that every transition in `tpl` is structurally typeable against the
 * port signatures returned by each runner's `resolveSpec`. Throws
 * {@link TemplatePortError} on the first violation.
 *
 * Rules:
 *  - port names must be unique per node,
 *  - empty `kinds[]` is rejected,
 *  - `fromSpec.outputs: []` (without `passthrough`) cannot feed any downstream
 *    step,
 *  - a transition out of a node with multiple outputs requires `fromPort`,
 *  - a `toSpec.inputs: []` cannot be the target of any non-loop transition,
 *  - if the target node has > 1 input ports, `toPort` is required,
 *  - if the targeted port is `isList: true`, `toPort` is required,
 *  - a non-isList port may receive at most 1 incoming non-loop transition,
 *  - `order` must be unique per `(to, toPort)` group when explicit,
 *  - non-optional ports must be alimented (by a transition, the entry seed,
 *    or a `readsFrom` variable).
 *
 * Loop edges (`isLoop: true`) skip type-compatibility and cardinality checks
 * — they carry feedback (`LoopHistoryInput`), not a fresh artifact.
 */
export const validateTemplatePorts = (
  tpl: WorkflowTemplate,
  registry: StepRunnerRegistry,
  artifactSchemas?: ArtifactSchemaRegistry,
): void => {
  // §2: refinement-aware port matcher. Optional: legacy call sites (a few
  // older tests) still pass nothing, in which case only direct-match + list
  // covariance is checked — fine, since those sites do not exercise
  // refinements.
  const resolver = artifactSchemas
    ? buildRefinementResolver(artifactSchemas)
    : undefined;
  // Cache resolved specs so we don't pay per-transition cost on large graphs.
  const specByStep = new Map<StepId, NodeSpec>();
  const specOf = (step: { id: string; kind: string; config: Readonly<Record<string, unknown>> }) => {
    const cached = specByStep.get(step.id as StepId);
    if (cached) return cached;
    const spec = resolveSpecSafe(registry, step, tpl);
    specByStep.set(step.id as StepId, spec);
    return spec;
  };

  for (const step of tpl.steps) {
    const spec = specOf(step);
    const portNames = new Set<string>();
    for (const p of spec.inputs) {
      if (p.kinds.length === 0) {
        throw new TemplatePortError(
          `step ${step.id} (${step.kind}) port "${p.name}" has empty kinds[]`,
        );
      }
      if (portNames.has(p.name)) {
        throw new TemplatePortError(
          `step ${step.id} (${step.kind}) declares duplicate port name "${p.name}"`,
        );
      }
      portNames.add(p.name);
    }
  }

  for (const t of tpl.transitions) {
    if (t.isLoop) continue;
    const from = findStep(tpl, t.from);
    const to = findStep(tpl, t.to);
    const fromSpec = specOf(from);
    const toSpec = specOf(to);

    if (fromSpec.passthrough && fromSpec.outputs.length === 0) {
      // Side-effect node (e.g. `workspace.set`): execution-only wire. The
      // orchestrator skips this kind when resolving the downstream step's
      // input via `previousDataStepId`, so we don't enforce kind compatibility
      // — and we tolerate downstream nodes with no input port (e.g.
      // `user.input` reading `seedArtifacts` directly).
      continue;
    }
    if (toSpec.inputs.length === 0) {
      throw new TemplatePortError(
        `step ${t.to} (${to.kind}) has no inputs, no transition can target it`,
      );
    }
    if (fromSpec.outputs.length === 0) {
      throw new TemplatePortError(
        `step ${t.from} (${from.kind}) has no outputs, cannot feed ${t.to}`,
      );
    }
    // Resolve the source slot. With > 1 output, `fromPort` is required.
    let fromOut: { kind: string; name: string } | undefined;
    if (t.fromPort) {
      fromOut = fromSpec.outputs.find((o) => o.name === t.fromPort);
      if (!fromOut) {
        const available = fromSpec.outputs.map((o) => o.name).join(", ");
        throw new TemplatePortError(
          `step ${t.from} (${from.kind}) has no output slot "${t.fromPort}" (declares: ${available || "(none)"})`,
        );
      }
    } else if (fromSpec.outputs.length === 1) {
      fromOut = fromSpec.outputs[0];
    } else {
      const slots = fromSpec.outputs.map((o) => o.name).join("|");
      throw new TemplatePortError(
        `transition out of ${t.from} requires fromPort (${fromSpec.outputs.length} outputs: ${slots})`,
      );
    }

    // `toPort` requirement: any multi-input target, or an isList target,
    // requires an explicit port name.
    const multiInput = toSpec.inputs.length > 1;
    let targeted: PortSpec | undefined;
    if (t.toPort) {
      targeted = toSpec.inputs.find((p) => p.name === t.toPort);
      if (!targeted) {
        throw new TemplatePortError(
          `transition ${t.from} → ${t.to}: toPort="${t.toPort}" does not exist on ${to.kind}`,
        );
      }
    } else {
      if (multiInput) {
        const slots = toSpec.inputs.map((p) => p.name).join("|");
        throw new TemplatePortError(
          `transition ${t.from} → ${t.to} requires toPort (multi-input target: ${slots})`,
        );
      }
      const onlyPort = toSpec.inputs[0];
      if (onlyPort?.isList) {
        throw new TemplatePortError(
          `transition ${t.from} → ${t.to} requires toPort: port "${onlyPort.name}" is isList (explicit name needed for convergence)`,
        );
      }
      targeted = onlyPort;
    }

    if (!targeted) {
      // Defensive — already covered by inputs.length === 0 check above.
      throw new TemplatePortError(
        `transition ${t.from} → ${t.to}: no valid target port resolved`,
      );
    }
    if (!portAccepts(targeted, fromOut.kind, resolver)) {
      throw new TemplatePortError(
        `transition ${t.from} → ${t.to}: output ${fromOut.kind} not accepted by port "${targeted.name}" (accepts ${targeted.kinds.join("|")})`,
      );
    }
  }

  // Cardinality + order checks per (step, port) group.
  type GroupKey = string; // `${stepId}|${portName}`
  const groups = new Map<GroupKey, Transition[]>();
  for (const t of tpl.transitions) {
    if (t.isLoop) continue;
    const to = findStep(tpl, t.to);
    const toSpec = specOf(to);
    // Resolve which port this transition targets. Skip if the source is a
    // passthrough side-effect node — those transitions are execution-only.
    const from = findStep(tpl, t.from);
    const fromSpec = specOf(from);
    if (fromSpec.passthrough && fromSpec.outputs.length === 0) continue;
    if (toSpec.inputs.length === 0) continue;

    const portName = t.toPort ?? toSpec.inputs[0]?.name;
    if (!portName) continue;
    const key: GroupKey = `${to.id}|${portName}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  for (const [key, edges] of groups) {
    const [stepId, portName] = key.split("|");
    const step = tpl.steps.find((s) => s.id === stepId);
    if (!step) continue;
    const spec = specOf(step);
    const port = spec.inputs.find((p) => p.name === portName);
    if (!port) continue;
    if (!port.isList && edges.length > 1) {
      // Relaxation: a non-isList port may receive N>1 incoming transitions
      // when they all come from mutually exclusive ports of a single
      // upstream `branch.*` ancestor (fork-merge pattern). Exactly one of
      // them will be alive at runtime — the others will be `skipped` and
      // the consumer resolves its input from the alive branch.
      if (!isMutuallyExclusiveFanIn(tpl, edges, specOf)) {
        throw new TemplatePortError(
          `port "${portName}" of step ${stepId} is not isList: rejecting ${edges.length} incoming transitions`,
        );
      }
    }
    if (port.isList) {
      const seenOrders = new Set<number>();
      for (const e of edges) {
        if (typeof e.order !== "number") continue;
        if (seenOrders.has(e.order)) {
          throw new TemplatePortError(
            `port "${portName}" of step ${stepId}: order conflict — multiple transitions share order=${e.order}`,
          );
        }
        seenOrders.add(e.order);
      }
    }
  }

  // Non-optional inputs must be alimented by at least one incoming transition
  // on that port, OR be the entry step (whose seedArtifacts populate the
  // input at runtime), OR be sourced from a template variable via `readsFrom`.
  const incomingByStepPort = new Map<string, number>();
  for (const [key, edges] of groups) {
    incomingByStepPort.set(key, edges.length);
  }
  for (const step of tpl.steps) {
    const spec = specOf(step);
    const isEntry = step.id === tpl.entryStep;
    for (const p of spec.inputs) {
      if (p.optional) continue;
      const fromVar = step.readsFrom?.[p.name];
      const incomingCount = incomingByStepPort.get(`${step.id}|${p.name}`) ?? 0;
      if (incomingCount === 0 && !isEntry && !fromVar) {
        throw new TemplatePortError(
          `step ${step.id} (${step.kind}) port "${p.name}" is non-optional but has no incoming transition`,
        );
      }
    }
  }

  validateBranchKindOrphans(tpl, specOf);
  validateAutoLoopWhitelist(tpl);
  validateTemplateVariables(tpl, registry, specOf, resolver);
  validateIterationScopes(tpl);
};

/**
 * Only steps that explicitly opt-in (`llm.judge`, `format.validate`) may carry an
 * outgoing `isLoop` transition that pins a `fromPort` — the orchestrator
 * treats such edges as auto-loop triggers. Forbidding them on other kinds
 * prevents a stray `isLoop: true` on a `claude_code.invoke` from silently
 * looping forever. See `specs/llm-judge-bounded-retries.md` §Risques.
 */
const AUTO_LOOP_WHITELIST: ReadonlyArray<string> = [
  "llm.judge",
  "format.validate",
  "claude_code.judge",
];

const validateAutoLoopWhitelist = (tpl: WorkflowTemplate): void => {
  const kindOf = new Map<StepId, string>(
    tpl.steps.map((s) => [s.id, s.kind]),
  );
  for (const t of tpl.transitions) {
    if (!t.isLoop) continue;
    if (!t.fromPort) continue;
    const kind = kindOf.get(t.from);
    if (!kind) continue;
    if (!AUTO_LOOP_WHITELIST.includes(kind)) {
      throw new TemplatePortError(
        `auto-loop edge ${t.from} → ${t.to} (fromPort="${t.fromPort}") originates from ${kind}, which is not in the auto-loop whitelist [${AUTO_LOOP_WHITELIST.join(", ")}]`,
      );
    }
  }
};

/**
 * Every declared port of a `branch.*` step must have at least one outgoing
 * non-loop transition — otherwise a verdict matching that label would
 * dead-end and the runner would `StepFailed` at execution time. Catching
 * this at save-time keeps templates trustworthy.
 */
const validateBranchKindOrphans = (
  tpl: WorkflowTemplate,
  specOf: (step: { id: string; kind: string; config: Readonly<Record<string, unknown>> }) => NodeSpec,
): void => {
  for (const step of tpl.steps) {
    if (!step.kind.startsWith("branch.")) continue;
    const spec = specOf(step);
    const declared = spec.outputs.map((o) => o.name);
    const wired = new Set(
      tpl.transitions
        .filter((t) => !t.isLoop && t.from === step.id && t.fromPort)
        .map((t) => t.fromPort as string),
    );
    const orphans = declared.filter((p) => !wired.has(p));
    if (orphans.length > 0) {
      throw new TemplatePortError(
        `step ${step.id} (${step.kind}): cases [${orphans.join(", ")}] have no outgoing transition — a verdict matching them would dead-end`,
      );
    }
  }
};

/**
 * Returns `true` if the N>1 incoming non-loop transitions all originate
 * from a common upstream `branch.*` step S, **via different ports of S**.
 *
 * Implementation: for each incoming edge, walk backward over non-loop
 * transitions until hitting a `branch.*` step. Collect the `(branchId, port)`
 * pair the path exits S through. The fan-in is mutually exclusive iff:
 *  - every path reaches a branch step (i.e. no path bypasses the branch),
 *  - every path reaches the **same** branch step,
 *  - at least two paths exit S via **different** ports.
 */
const isMutuallyExclusiveFanIn = (
  tpl: WorkflowTemplate,
  edges: ReadonlyArray<Transition>,
  specOf: (step: { id: string; kind: string; config: Readonly<Record<string, unknown>> }) => NodeSpec,
): boolean => {
  const stepKind = new Map<string, string>(
    tpl.steps.map((s) => [s.id as string, s.kind]),
  );

  /** Walk backward until we hit a branch step; return the `(branchId, port)`. */
  const findBranchExit = (
    edge: Transition,
  ): { branchId: string; port: string } | null => {
    // Edge.from might itself be a branch.
    if (stepKind.get(edge.from)?.startsWith("branch.")) {
      const port = edge.fromPort ?? "";
      if (!port) return null;
      return { branchId: edge.from, port };
    }
    // Otherwise, BFS backward via non-loop transitions.
    const visited = new Set<string>();
    const queue: string[] = [edge.from];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      // Find non-loop transitions into `cur`.
      for (const t of tpl.transitions) {
        if (t.isLoop) continue;
        if (t.to !== cur) continue;
        if (stepKind.get(t.from)?.startsWith("branch.")) {
          return {
            branchId: t.from,
            port: t.fromPort ?? "",
          };
        }
        queue.push(t.from);
      }
    }
    return null;
  };

  const exits = edges.map(findBranchExit);
  if (exits.some((e) => e === null)) return false;
  const valid = exits.filter((e): e is { branchId: string; port: string } => !!e);
  const branchIds = new Set(valid.map((e) => e.branchId));
  if (branchIds.size !== 1) return false;
  const ports = new Set(valid.map((e) => e.port));
  if (ports.size < 2) return false;
  // Sanity: each port must be a declared output of the branch step.
  const [branchId] = [...branchIds];
  const branchStep = tpl.steps.find((s) => s.id === branchId);
  if (!branchStep) return false;
  const declared = new Set(specOf(branchStep).outputs.map((o) => o.name));
  return [...ports].every((p) => declared.has(p));
};

/**
 * Runs the iteration-scope topology check (foreach/collect pairing, no
 * nested loops, no bypass, no cross-boundary feedback) and rethrows
 * violations as `TemplatePortError` so callers don't need a separate catch.
 */
const validateIterationScopes = (tpl: WorkflowTemplate): void => {
  try {
    inferIterationScopes(tpl);
  } catch (err) {
    if (err instanceof IterationScopeError) {
      throw new TemplatePortError(`${err.code}: ${err.message}`);
    }
    throw err;
  }
};

/**
 * Variable-flow validation — mirrors the rules of the variables spec, with
 * the fan-in extension allowing a `readsFrom` variable to be prepended to an
 * isList port's incoming-transition list (rule 11).
 */
const validateTemplateVariables = (
  tpl: WorkflowTemplate,
  registry: StepRunnerRegistry,
  specOf: (step: { id: string; kind: string; config: Readonly<Record<string, unknown>> }) => NodeSpec,
  resolver: RefinementParentResolver | undefined,
): void => {
  void registry;
  const variableByName = new Map(tpl.variables.map((v) => [v.name, v]));

  // Index producers per variable (for rule 9 reachability check).
  const producersByVariable = new Map<string, Set<StepId>>();
  for (const step of tpl.steps) {
    if (!step.writesTo) continue;
    const spec = specOf(step);
    const outputNames = new Set(spec.outputs.map((o) => o.name));
    // Rule 5b: `loop.foreach` publishing the current item into a variable
    // (`writesTo.item`) relies on strictly sequential execution — a variable is
    // a shared cell, so a parallel loop would collapse every iteration onto the
    // last item. Reject it when the config opts into parallel execution.
    // (See spec `loop-foreach-item-variable.md` §4.)
    if (
      step.kind === "loop.foreach" &&
      step.writesTo["item"] !== undefined &&
      step.config["sequential"] === false
    ) {
      throw new TemplatePortError(
        `loop.foreach "${step.id}": writesTo.item requires sequential execution ` +
          `(a variable is a shared cell; in parallel every item would collapse onto ` +
          `the last one). Use a data edge from the "item" port instead.`,
      );
    }
    for (const [portName, variableName] of Object.entries(step.writesTo)) {
      // Rule 3: writesTo key must reference a declared output slot.
      if (!outputNames.has(portName)) {
        throw new TemplatePortError(
          `step ${step.id} (${step.kind}) writesTo["${portName}"] but no such output slot (declares: ${
            [...outputNames].join(", ") || "(none)"
          })`,
        );
      }
      // Rule 4: writesTo value must reference a declared variable.
      const variable = variableByName.get(variableName);
      if (!variable) {
        throw new TemplatePortError(
          `step ${step.id} (${step.kind}) writesTo["${portName}"]="${variableName}" but variable not declared on template`,
        );
      }
      // Rule 5: kind of the slot must match the variable kind.
      const slot = spec.outputs.find((o) => o.name === portName);
      if (slot && slot.kind !== variable.kind) {
        throw new TemplatePortError(
          `step ${step.id} (${step.kind}) writesTo["${portName}"] kind mismatch: slot produces ${slot.kind}, variable "${variableName}" expects ${variable.kind}`,
        );
      }
      const set = producersByVariable.get(variableName) ?? new Set<StepId>();
      set.add(step.id);
      producersByVariable.set(variableName, set);
    }
  }

  // Gate 1 (`launch-input-variables.md` §Contrainte): a `promptAtLaunch`
  // variable is materialized from the launch dialog before any step runs and
  // joins the `seeded` predicate. An in-graph producer (`writesTo`) would, by
  // last-writer-wins, clobber the value the user entered — making the launch
  // field silently misleading. Reject the template so the author resolves the
  // contradiction (drop the producer, or drop the opt-in).
  for (const variable of tpl.variables) {
    if (variable.promptAtLaunch !== true) continue;
    const producers = producersByVariable.get(variable.name);
    if (producers && producers.size > 0) {
      throw new TemplatePortError(
        `variable "${variable.name}" is promptAtLaunch but is also written by step(s) [${[...producers].join(", ")}] ` +
          `— a launch input cannot have an in-graph producer (last-writer-wins would overwrite the entered value)`,
      );
    }
  }

  // Pre-compute reverse ancestors via non-loop edges for rule 9.
  const ancestorsByStep = computeNonLoopAncestors(tpl);

  for (const step of tpl.steps) {
    if (!step.readsFrom) continue;
    const spec = specOf(step);
    const inputByName = new Map(spec.inputs.map((p) => [p.name, p]));
    for (const [portName, variableName] of Object.entries(step.readsFrom)) {
      // Rule 6: readsFrom key must reference a declared input port.
      const port = inputByName.get(portName);
      if (!port) {
        throw new TemplatePortError(
          `step ${step.id} (${step.kind}) readsFrom["${portName}"] but no such input port (declares: ${
            [...inputByName.keys()].join(", ") || "(none)"
          })`,
        );
      }
      // Rule 7: readsFrom value must reference a declared variable.
      const variable = variableByName.get(variableName);
      if (!variable) {
        throw new TemplatePortError(
          `step ${step.id} (${step.kind}) readsFrom["${portName}"]="${variableName}" but variable not declared on template`,
        );
      }
      // Rule 8: port must accept the variable kind.
      if (!portAccepts(port, variable.kind, resolver)) {
        throw new TemplatePortError(
          `step ${step.id} (${step.kind}) readsFrom["${portName}"]="${variableName}" kind mismatch: variable is ${variable.kind} but port accepts [${port.kinds.join("|")}]`,
        );
      }
      // A variable seeded by the caller (`role: "input"`, the interface seed
      // of a sub-workflow) or by a literal `defaultValue` is materialized into
      // an artifact *before any step runs* (cf. `start-instance.ts` §seeds /
      // variableDefaults). It therefore always has a value, with no in-template
      // `writesTo` producer — so Rule 9 (a producer must exist) and Rule 9b
      // (a producer must be an ancestor) do not apply. Without this exemption a
      // sub-template that reads its `input` variable could never be saved,
      // blocking the `workflow.call` flattening that rebinds that read onto a
      // host variable (`flatten-template.ts` §1).
      const seeded =
        variable.role === "input" ||
        variable.defaultValue !== undefined ||
        variable.promptAtLaunch === true;
      if (!seeded) {
        // Rule 9: at least one producer must be an ancestor (or the step
        // itself in a self-loop pattern — accepted because the same step's
        // earlier iteration writes the variable before the loop reread).
        const producers = producersByVariable.get(variableName);
        if (!producers || producers.size === 0) {
          throw new TemplatePortError(
            `step ${step.id} (${step.kind}) reads variable "${variableName}" but no step writes to it`,
          );
        }
        const ancestors = ancestorsByStep.get(step.id) ?? new Set<StepId>();
        const hasAncestor = [...producers].some(
          (p) => p === step.id || ancestors.has(p),
        );
        if (!hasAncestor) {
          throw new TemplatePortError(
            `step ${step.id} (${step.kind}) reads variable "${variableName}" but its producers [${[...producers].join(", ")}] are not ancestors in the control-flow DAG`,
          );
        }
      }
      // Rule 10: a consumer with readsFrom still needs a control-flow
      // entrance (unless it is the entry step itself).
      const hasIncoming = tpl.transitions.some((t) => !t.isLoop && t.to === step.id);
      if (!hasIncoming && step.id !== tpl.entryStep) {
        throw new TemplatePortError(
          `step ${step.id} (${step.kind}) reads variable "${variableName}" but has no incoming control-flow transition (variables resolve data, not control)`,
        );
      }
    }
  }

};

/**
 * Returns, for each step, the set of all its ancestors in the non-loop
 * subgraph. Used to check rule 9 (a variable consumer must be reachable
 * from at least one of its producers via control-flow edges).
 */
const computeNonLoopAncestors = (
  tpl: WorkflowTemplate,
): Map<StepId, Set<StepId>> => {
  const reverse = new Map<StepId, StepId[]>();
  for (const t of tpl.transitions) {
    if (t.isLoop) continue;
    const list = reverse.get(t.to) ?? [];
    list.push(t.from);
    reverse.set(t.to, list);
  }
  const memo = new Map<StepId, Set<StepId>>();
  const walk = (id: StepId, seen: Set<StepId>): Set<StepId> => {
    if (memo.has(id)) {
      const cached = memo.get(id)!;
      for (const a of cached) seen.add(a);
      return seen;
    }
    const acc = new Set<StepId>();
    for (const parent of reverse.get(id) ?? []) {
      acc.add(parent);
      // Guard against malformed cycles already rejected by validateTemplate.
      walk(parent, acc);
    }
    memo.set(id, acc);
    for (const a of acc) seen.add(a);
    return seen;
  };
  for (const step of tpl.steps) walk(step.id, new Set<StepId>());
  return memo;
};

/**
 * Convenience helper called from the composition root post-bootstrap: validates
 * every built-in template against the runner registry.
 *
 * Failures are logged per-seed and swallowed — a built-in seed that references
 * a kind contributed by a misconfigured (or absent) plugin must not prevent
 * the app from booting. Other seeds and the rest of the boot sequence still
 * proceed. Genuine structural bugs in a seed still surface here (loudly), and
 * fall through to the runtime validation in `save-template` / instance start
 * if anyone tries to actually use the broken template.
 */
export const validateBuiltinSeeds = (
  seeds: ReadonlyArray<WorkflowTemplate>,
  registry: StepRunnerRegistry,
  artifactSchemas?: ArtifactSchemaRegistry,
): void => {
  for (const tpl of seeds) {
    try {
      validateTemplatePorts(tpl, registry, artifactSchemas);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[wf:seeds] built-in template "${tpl.id}" failed validation — skipped: ${msg}`,
      );
    }
  }
};
