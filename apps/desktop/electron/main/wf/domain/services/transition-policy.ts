/**
 * Pure graph traversal over a {@link WorkflowTemplate}'s transitions.
 *
 * This is a domain *service* (stateless, no IO) consumed by the orchestrator
 * to decide the next step after a validation or whether a requested loop is
 * authorized by the template.
 */
import type { StepId } from "../ids";
import type { Transition, WorkflowTemplate } from "../template";

/**
 * Returns the next step after `from` following a non-loop transition, or
 * `null` if `from` has no forward edge (typical for exit steps).
 *
 * Assumes the template has at most one non-loop outgoing edge per step —
 * true for the MVP workflow; richer branching would require a predicate.
 *
 * @deprecated For branching/multi-output steps, prefer {@link successors} which
 * returns every outgoing transition so the orchestrator can route by port.
 * Kept for legacy call sites that know the graph is monomorphic by
 * construction.
 */
export const nextStep = (tpl: WorkflowTemplate, from: StepId): StepId | null => {
  for (const t of tpl.transitions) {
    if (t.from === from && !t.isLoop) return t.to;
  }
  return null;
};

/**
 * Returns every non-loop transition leaving `from`, in declaration order
 * (i.e. their index in `tpl.transitions`). Used by the orchestrator when a
 * step's outcome is `produced-on-port` or when validation needs to decide
 * whether the step is a fork. For monomorphic 1-successor steps, the
 * returned array has length 1.
 */
export const successors = (
  tpl: WorkflowTemplate,
  from: StepId,
): ReadonlyArray<Transition> =>
  tpl.transitions.filter((t) => t.from === from && !t.isLoop);

/**
 * Returns whether the template authorizes a loop from `from` to `to`. A user's
 * {@link OpenFeedbackLoop} call is rejected if this returns false.
 */
export const canLoop = (
  tpl: WorkflowTemplate,
  from: StepId,
  to: StepId,
): boolean =>
  tpl.transitions.some((t) => t.from === from && t.to === to && t.isLoop);

/** Returns true if the given step is an exit of the template. */
export const isExit = (tpl: WorkflowTemplate, step: StepId): boolean =>
  tpl.exitSteps.includes(step);
