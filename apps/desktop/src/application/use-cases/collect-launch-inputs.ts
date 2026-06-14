import type { TemplateDraft, TemplateView } from "../../domain/workflow/types";

/**
 * One template variable opted in (`promptAtLaunch`) to be asked in the
 * run-launch dialog. Pre-filled from `defaultValue` when present; otherwise the
 * field is `required` (an empty slot the user must fill in before launching).
 */
export type LaunchInput = {
  name: string;
  kind: string;
  description?: string;
  defaultValue?: string;
  /** `true` ⇔ no `defaultValue` — the field must be filled before launch. */
  required: boolean;
};

/**
 * Lists the template variables flagged `promptAtLaunch` — the ones the launch
 * dialog renders a field for (`launch-input-variables.md` §P0/§P3). Declaration
 * order is preserved so the form is stable across renders. Pure function;
 * sibling of {@link collectMissingTemplateDeps}, meant to be memoized on the
 * template in the editor.
 */
export const collectLaunchInputs = (
  template: TemplateView | TemplateDraft,
): ReadonlyArray<LaunchInput> =>
  template.variables
    .filter((v) => v.promptAtLaunch === true)
    .map((v) => ({
      name: v.name,
      kind: v.kind,
      ...(v.description !== undefined ? { description: v.description } : {}),
      ...(v.defaultValue !== undefined ? { defaultValue: v.defaultValue } : {}),
      required: v.defaultValue === undefined,
    }));
