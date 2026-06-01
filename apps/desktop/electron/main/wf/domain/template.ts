/**
 * A {@link WorkflowTemplate} is the *definition* of a workflow — the graph of
 * steps, their kinds, roles and transitions (including authorized loops).
 *
 * Templates are **workflow-as-data**: the engine does not encode any specific
 * workflow in code. New workflows are expressed as templates and consumed by
 * the same orchestrator.
 */
import type { ArtifactKind } from "./artifact";
import type { StepId, TemplateId, TemplateVersion } from "./ids";

/**
 * Identifier of a step runner plugged into the engine via
 * {@link StepRunnerRegistry.register}. Built-in kinds are `user.input`,
 * `claude_code.invoke` and `human.gate`; new kinds are pluggable.
 */
export type StepKindId = "user.input" | "claude_code.invoke" | "human.gate" | string;

/** Logical role expected to act on a step (used by `human.gate` for RBAC in v2). */
export type ActorRole = "PO" | "Developer" | "LLMAgent";

/**
 * A node in the workflow graph.
 *
 * @property kind The {@link StepKindId} — the engine resolves it to a runner.
 * @property config Per-kind configuration blob; the runner parses it.
 * @property inputKinds @deprecated Resolved at runtime via the runner's `resolveSpec`.
 *                      Kept optional for replay safety with persisted templates.
 * @property outputKind @deprecated Polymorphic runners now read `config.outputKind`;
 *                      monomorphic runners hard-code it. Kept optional for
 *                      replay safety with persisted templates.
 * @property humanGateRequired If true, the step pauses in `awaitingHuman` after running.
 * @property writesTo Map of output slot name → template variable name. Each slot
 *                    that has an entry here writes its produced artifact into
 *                    the named variable when the step is validated. Keys must
 *                    correspond to declared `outputs[*].name` of the runner;
 *                    values to declared `WorkflowTemplate.variables[*].name`.
 * @property readsFrom Map of input port name → template variable name. When set
 *                     for a port, the orchestrator feeds the artifact currently
 *                     stored in that variable to the runner — short-circuiting
 *                     the upstream-transition resolution for that port.
 * @property note Free-form note attached to this step instance (not to the
 *                kind). Persisted with the template and removed when the step
 *                is deleted from the workflow.
 */
export type StepDef = {
  id: StepId;
  name: string;
  kind: StepKindId;
  actorRole: ActorRole;
  config: Readonly<Record<string, unknown>>;
  inputKinds?: ReadonlyArray<ArtifactKind>;
  outputKind?: ArtifactKind;
  humanGateRequired: boolean;
  writesTo?: Readonly<Record<string, string>>;
  readsFrom?: Readonly<Record<string, string>>;
  note?: string;
};

/**
 * A typed named slot shared by every step of an instance. Declared at template
 * level (this type), assigned at runtime via `step.writesTo`, read via
 * `step.readsFrom`. The kind constrains both ends: a producer must emit that
 * exact kind, a consumer port must accept it.
 */
export type TemplateVariable = {
  /**
   * Stable identifier referenced by `writesTo` / `readsFrom` and persisted in
   * `VariableAssigned` events. Must match `^[a-zA-Z_][a-zA-Z0-9_]*$`.
   */
  name: string;
  kind: ArtifactKind;
  /**
   * Interface role of the variable, used to make a template reusable as a
   * sub-workflow (`sub-template-invoke.md` §1 / `sub-template-expand.md`):
   *  - `input`    → consumed from the caller (seed of the sub-graph);
   *  - `output`   → exposed back to the caller;
   *  - `internal` → private to the template (the default).
   * Absent ⇒ treated as `internal` (legacy templates are not invocable until
   * their author tags an interface).
   */
  role?: "input" | "output" | "internal";
  /** Short description rendered in the variables panel and tooltips. */
  description?: string;
  /**
   * Optional literal materialized into an artifact and pre-assigned to the
   * variable at launch, before any step runs. Must validate against `kind`
   * (a raw scalar, or a JSON array for a `List<X>`). Absent ⇒ empty slot at
   * startup (legacy behaviour). A producer step (`writesTo`) overwrites it
   * (last-writer-wins).
   */
  defaultValue?: string;
};

/**
 * Directed edge between two steps of the template.
 *
 * @property fromPort Name of the output slot on the source step. Required when
 *                    the source has > 1 output (so the orchestrator knows which
 *                    slot's artifact to route). Optional when the source has at
 *                    most one slot — the unique slot (or `"out"` by convention)
 *                    is used as the default. Ignored on loop edges.
 * @property toPort   Name of the input port on the destination step. Required
 *                    when the destination has > 1 input port, or when the
 *                    targeted port is `isList: true`. Optional otherwise.
 * @property isLoop   If true, this edge is a *loop* (e.g. validate → generate)
 *                    and is only traversed via {@link OpenFeedbackLoop}.
 *                    Non-loop cycles are forbidden by {@link validateTemplate}.
 * @property order    Relative order among incoming transitions targeting the
 *                    same `(to, toPort)`. Only meaningful when the target
 *                    port is `isList: true` — the orchestrator sorts incoming
 *                    transitions by `order` ascending, then by index in
 *                    `transitions[]` to break ties. Absent ⇒ +∞ (treated as
 *                    "tail", sorted by creation index).
 */
export type Transition = {
  from: StepId;
  fromPort?: string;
  toPort?: string;
  to: StepId;
  isLoop: boolean;
  order?: number;
  /**
   * If set, this edge is inside the iteration scope opened by the given
   * `loop.foreach` step. Computed by `inferIterationScopes` from the topology;
   * not set by authors. The orchestrator derives the scope lazily when needed
   * (no in-place template mutation is required for replay).
   */
  scopeOf?: StepId;
};

/**
 * The immutable specification of a workflow at a given version.
 * Status is `draft` during authoring and `published` once frozen.
 */
export type WorkflowTemplate = {
  id: TemplateId;
  name: string;
  description: string;
  version: TemplateVersion;
  entryStep: StepId;
  exitSteps: ReadonlyArray<StepId>;
  steps: ReadonlyArray<StepDef>;
  transitions: ReadonlyArray<Transition>;
  /**
   * Named typed slots shared by all steps of an instance of this template.
   * Producers reference them via `StepDef.writesTo`, consumers via
   * `StepDef.readsFrom`. Empty for templates that route data exclusively via
   * transitions — backward-compatible default for legacy templates.
   */
  variables: ReadonlyArray<TemplateVariable>;
  status: "draft" | "published";
};

/** Thrown when a template violates a structural invariant. */
export class TemplateError extends Error {}

/** Thrown when a template's port typing is inconsistent with the runner registry. */
export class TemplatePortError extends TemplateError {}

/**
 * Asserts the structural invariants of a {@link WorkflowTemplate}:
 *  - `entryStep` and every `exitSteps` entry belong to `steps`;
 *  - every transition endpoint references a known step;
 *  - the graph has no cycle through non-loop edges.
 *
 * @throws {TemplateError} on any violation.
 */
export const validateTemplate = (tpl: WorkflowTemplate): void => {
  const stepIds = new Set(tpl.steps.map((s) => s.id));
  if (!stepIds.has(tpl.entryStep)) {
    throw new TemplateError(`entryStep ${tpl.entryStep} is not in steps`);
  }
  for (const exit of tpl.exitSteps) {
    if (!stepIds.has(exit)) {
      throw new TemplateError(`exitStep ${exit} is not in steps`);
    }
  }
  for (const t of tpl.transitions) {
    if (!stepIds.has(t.from) || !stepIds.has(t.to)) {
      throw new TemplateError(
        `transition references unknown step: ${t.from} -> ${t.to}`,
      );
    }
  }
  validateVariableDeclarations(tpl);
  detectInvalidCycles(tpl);
};

/**
 * Structural checks on `tpl.variables[]` — applied at the domain level
 * (no runner dependency). The reachability + kind-matching rules are
 * handled by {@link validateTemplatePorts}.
 */
const VARIABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const validateVariableDeclarations = (tpl: WorkflowTemplate): void => {
  if (!Array.isArray(tpl.variables)) {
    throw new TemplateError(
      `tpl.variables must be an array of TemplateVariable (got ${tpl.variables === undefined ? "undefined" : typeof tpl.variables}). Use [] if the template has no variables.`,
    );
  }
  const seen = new Set<string>();
  for (const v of tpl.variables) {
    if (!VARIABLE_NAME_RE.test(v.name)) {
      throw new TemplateError(
        `template variable "${v.name}" has invalid name (expected ${VARIABLE_NAME_RE})`,
      );
    }
    if (seen.has(v.name)) {
      throw new TemplateError(`duplicate template variable: "${v.name}"`);
    }
    seen.add(v.name);
  }
};

/**
 * Runs a DFS over the non-loop edges and throws if any cycle is detected.
 * Loop edges are *intentional* cycles (feedback loops) and are excluded.
 */
const detectInvalidCycles = (tpl: WorkflowTemplate) => {
  const forward = new Map<StepId, StepId[]>();
  for (const t of tpl.transitions) {
    if (t.isLoop) continue;
    const list = forward.get(t.from) ?? [];
    list.push(t.to);
    forward.set(t.from, list);
  }
  const visiting = new Set<StepId>();
  const visited = new Set<StepId>();
  const dfs = (s: StepId): void => {
    if (visited.has(s)) return;
    if (visiting.has(s)) {
      throw new TemplateError(`unmarked cycle through step ${s}`);
    }
    visiting.add(s);
    for (const next of forward.get(s) ?? []) dfs(next);
    visiting.delete(s);
    visited.add(s);
  };
  for (const step of tpl.steps) dfs(step.id);
};

/**
 * Looks up a step definition by id within a template.
 * @throws {TemplateError} if the id is unknown.
 */
export const findStep = (tpl: WorkflowTemplate, id: StepId): StepDef => {
  const s = tpl.steps.find((x) => x.id === id);
  if (!s)
    throw new TemplateError(
      `step ${id} not found in template ${tpl.id}@${tpl.version}`,
    );
  return s;
};
