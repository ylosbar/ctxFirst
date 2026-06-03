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
import type { TemplateId, TemplateVersion } from "../ids";
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

/**
 * The literal sub-template a `template.invoke` step points at — pinned in the
 * step config when the author picks it in the editor (`sub-template-invoke.md`
 * §2). Mirrors `WorkflowCallRef`; the two kinds carry the same `{ templateId,
 * templateVersion }` shape but live on separate code paths.
 */
export type TemplateInvokeRef = {
  templateId: TemplateId;
  templateVersion: TemplateVersion;
};

/** Canonical `id@version` key for a {@link TemplateInvokeRef} snapshot map. */
export const templateInvokeRefKey = (ref: TemplateInvokeRef): string =>
  `${ref.templateId}@${ref.templateVersion}`;

/** Thrown when a `template.invoke` step is malformed (missing/cyclic ref). */
export class TemplateInvokeError extends Error {}

/**
 * Reads the `{ templateId, templateVersion }` reference out of a
 * `template.invoke` step's config. Throws {@link TemplateInvokeError} if absent
 * — a `template.invoke` with no literal ref cannot resolve its child template.
 */
export const readTemplateInvokeRef = (step: StepDef): TemplateInvokeRef => {
  const id = step.config["templateId"];
  const version = step.config["templateVersion"];
  if (typeof id !== "string" || typeof version !== "string") {
    throw new TemplateInvokeError(
      `template.invoke step "${step.id}" is missing a literal { templateId, templateVersion } config`,
    );
  }
  return {
    templateId: id as TemplateId,
    templateVersion: version as TemplateVersion,
  };
};
