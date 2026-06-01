/**
 * Shared port / node-spec types used by both the main process (engine) and the
 * renderer (UI). Kept here so the typing of a transition stays identical on
 * both sides — the engine validates against this same shape via
 * `validate-template-ports.ts`, and the renderer's `isValidConnection` reuses
 * the same predicates.
 */

/**
 * A concrete artifact kind name or the `"*"` wildcard (accepts any kind).
 * Concrete kind names are listed in {@link ARTIFACT_KIND_NAMES} but the
 * matcher itself remains a plain string so the shared module stays decoupled
 * from each side's stricter `ArtifactKind` union.
 */
export type PortKindMatcher = string;

export const WILDCARD_KIND = "*" as const;

export type PortView = {
  name: string;
  kinds: ReadonlyArray<PortKindMatcher>;
  optional?: boolean;
  isList?: boolean;
  /**
   * UI hint: canonical input the user is expected to wire most often. Cosmetic
   * only — the orchestrator ignores it. At most one input per node.
   */
  primary?: boolean;
};

/**
 * Mirror of the engine-side `OutputPort`: one named output slot. `name` is
 * required and persists in events as the slot anchor for transitions.
 */
export type OutputPortView = {
  name: string;
  kind: string;
  description?: string;
  /** UI hint: canonical product of the node. Cosmetic, at most one per node. */
  primary?: boolean;
};

export type NodeSpecView = {
  kind: string;
  title: string;
  description?: string;
  inputs: ReadonlyArray<PortView>;
  /**
   * Output slots in declaration order. Empty for side-effect nodes; pair with
   * `passthrough: true` if outgoing transitions should still be allowed as
   * execution-only wires.
   */
  outputs: ReadonlyArray<OutputPortView>;
  /**
   * `true` for side-effect "command" nodes (e.g. `workspace.set`) that emit
   * no artifact but stay chainable. Outgoing transitions from these nodes
   * are execution-only wires; type checking is skipped (the downstream
   * input is resolved from the previous data-producing ancestor).
   */
  passthrough?: boolean;
};

/**
 * Mirror of the engine-side `TemplateVariable` — a typed named slot declared
 * at template level and shared across all steps of an instance.
 */
export type TemplateVariableView = {
  name: string;
  kind: string;
  /**
   * Interface role (`input`/`output`/`internal`) — mirror of the engine-side
   * `TemplateVariable.role`. Drives sub-workflow invocation
   * (`sub-template-expand.md` §1). Absent ⇒ `internal`.
   */
  role?: "input" | "output" | "internal";
  description?: string;
  /**
   * Optional literal pre-assigned to the variable at launch (before any step).
   * Mirror of the engine-side `TemplateVariable.defaultValue`.
   */
  defaultValue?: string;
};
