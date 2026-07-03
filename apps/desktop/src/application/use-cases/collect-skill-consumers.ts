import type { TemplateView } from "../../domain/workflow/types";

/** One template that references a skill + the steps that reference it. */
export type SkillConsumer = {
  /** `${id}@${version}` — key for `templateUriFor` + `openEditor`. */
  templateRef: string;
  /** Display label (falls back to `templateRef` when `name` is empty). */
  templateName: string;
  status: "draft" | "published";
  /** Provenance: the template's steps whose `config.skillRef === skillRef`. */
  usedBySteps: ReadonlyArray<{ id: string; name: string }>;
};

const isString = (v: unknown): v is string => typeof v === "string";

/**
 * Walks `templates` and returns those with at least one step whose
 * `config.skillRef === skillRef` (exact match, kind-agnostic — so it covers
 * `skill.loader` **and** `openrouter.invoke`). A template with N matching steps
 * appears **once** with N entries in `usedBySteps`. Pure & memoizable on
 * `(skillRef, templates)`. Inverse of {@link collectTemplateDeps} (template →
 * skills), indexed on the skill instead of the template.
 */
export const collectSkillConsumers = (
  skillRef: string,
  templates: ReadonlyArray<TemplateView>,
): ReadonlyArray<SkillConsumer> => {
  if (!skillRef) return [];
  const out: SkillConsumer[] = [];
  for (const tpl of templates) {
    const steps = tpl.steps.filter((s) => {
      const ref = s.config?.["skillRef"];
      return isString(ref) && ref === skillRef;
    });
    if (steps.length === 0) continue;
    out.push({
      templateRef: `${tpl.id}@${tpl.version}`,
      templateName: tpl.name || `${tpl.id}@${tpl.version}`,
      status: tpl.status,
      usedBySteps: steps.map((s) => ({ id: s.id, name: s.name })),
    });
  }
  return out.sort((a, b) => a.templateName.localeCompare(b.templateName));
};
