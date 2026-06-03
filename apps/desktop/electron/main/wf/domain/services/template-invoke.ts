/**
 * Shared constants and lightweight predicates for the `template.invoke` step
 * kind (Approach A — child-instance spawn-and-wait, `sub-template-invoke.md`).
 *
 * This is the *second* template-composition mechanism, coexisting with
 * `workflow.call` (Approach B — graph inlining, see `flatten-template.ts`). The
 * two are distinct step kinds and share only the `TemplateVariable.role`
 * interface model; nothing here touches the flatten path.
 *
 * **Phase A:** this module exists to anchor the kind id and the depth bound so
 * later phases (runner, orchestrator, validation, snapshot closure) can import a
 * single source of truth. No runner is registered for the kind yet, so
 * {@link hasTemplateInvoke} returns `false` for every current template.
 */
import type { StepDef, WorkflowTemplate } from "../template";

/** Step kind discriminator for an Approach-A sub-template invocation. */
export const TEMPLATE_INVOKE_KIND = "template.invoke";

/**
 * Maximum invocation depth of the `template.invoke` tree (`sub-template-invoke.md`
 * §14). A cycle is already forbidden, but an acyclic `A → B → C → …` chain could
 * still spawn unboundedly many instances; this bound guarantees termination.
 * Checked at root start (fail fast) and at each runtime spawn (defense in depth).
 */
export const MAX_INVOCATION_DEPTH = 8;

/** True when `step` is a `template.invoke`. */
export const isTemplateInvoke = (step: StepDef): boolean =>
  step.kind === TEMPLATE_INVOKE_KIND;

/** True when `tpl` contains at least one `template.invoke` step. */
export const hasTemplateInvoke = (tpl: WorkflowTemplate): boolean =>
  tpl.steps.some(isTemplateInvoke);
