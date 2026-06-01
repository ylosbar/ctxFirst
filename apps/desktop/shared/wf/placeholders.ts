/**
 * Pure helpers for `{{name}}` placeholder substitution in Markdown templates.
 *
 * Used by:
 *  - the `concat.markdown` runner (template mode) to interpolate placeholders
 *    in the `main` template using values from `markdown1..3`;
 *  - the renderer (e.g. `SkillEditor`) to list referenced placeholders as a
 *    non-blocking affordance.
 *
 * Grammar is aligned with {@link TemplateVariable.name}
 * (`^[a-zA-Z_][a-zA-Z0-9_]*$`); whitespace around the name is tolerated:
 * `{{ spec }}` ≡ `{{spec}}`.
 */

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Lists the placeholder names referenced in `template`, in order of first
 * appearance, deduplicated. Names not matching the grammar are ignored.
 */
export const extractPlaceholders = (template: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
};

export type RenderPolicy = {
  /** What to do when a `{{name}}` has no value in `values`. */
  onMissing: "keep" | "empty" | "error";
};

export type RenderResult = {
  output: string;
  /** Placeholders referenced in the template that had no value. */
  missing: string[];
  /** Keys present in `values` that the template never references. */
  unused: string[];
};

/**
 * Substitutes each `{{name}}` in `template` by `values.get(name)`. Pure and
 * deterministic.
 *
 *  - `onMissing: "keep"` — unresolved placeholders stay as-is in the output;
 *  - `onMissing: "empty"` — unresolved placeholders are replaced by `""`;
 *  - `onMissing: "error"` — throws `Error` listing the missing names.
 */
export const renderTemplate = (
  template: string,
  values: ReadonlyMap<string, string>,
  policy: RenderPolicy,
): RenderResult => {
  const missingSet = new Set<string>();
  const referenced = new Set<string>();
  const output = template.replace(PLACEHOLDER_RE, (match, rawName: string) => {
    const name = rawName;
    referenced.add(name);
    const value = values.get(name);
    if (value !== undefined) return value;
    missingSet.add(name);
    if (policy.onMissing === "empty") return "";
    return match;
  });
  const missing = [...missingSet];
  if (policy.onMissing === "error" && missing.length > 0) {
    throw new Error(
      `placeholders manquants: ${missing.map((n) => `{{${n}}}`).join(", ")}`,
    );
  }
  const unused: string[] = [];
  for (const key of values.keys()) {
    if (!referenced.has(key)) unused.push(key);
  }
  return { output, missing, unused };
};
