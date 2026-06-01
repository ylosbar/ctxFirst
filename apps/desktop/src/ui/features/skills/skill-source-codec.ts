import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { SkillView } from "../../../domain/workflow/types";

// The skill editor edits a single markdown buffer of the form
// `---\n<yaml frontmatter>\n---\n\n<body>`. The IPC contract still persists
// `{ ref, body, meta }` separately, so this module marshals between the
// in-memory source text and the domain shape. Nothing here touches IPC.

// Built by join (rather than a template literal) so the trailing space after
// `name: ` / `description: ` is explicit and survives lint's no-trailing-space
// rule. The space matters: the caret lands after it, so a typed slug forms
// valid YAML (`name: foo`, not `name:foo`).
/** Starter buffer for `skill://new` (and the fallback when no skill loads). */
export const EMPTY_TEMPLATE = [
  "---",
  "name: ",
  "description: ",
  "---",
  "",
  "Tu es un agent…",
  "",
].join("\n");

/**
 * Caret offset placed at the end of the `name:` line of {@link EMPTY_TEMPLATE},
 * so a fresh editor lands where the user types the slug.
 */
export const NEW_SKILL_CURSOR_POS = (() => {
  const start = EMPTY_TEMPLATE.indexOf("name:");
  if (start < 0) return 0;
  const eol = EMPTY_TEMPLATE.indexOf("\n", start);
  return eol < 0 ? EMPTY_TEMPLATE.length : eol;
})();

/** Reconstruct the editable source text from a loaded skill. */
export const skillToSource = (skill: SkillView | null): string => {
  if (!skill) return EMPTY_TEMPLATE;
  const { description, ...rest } = skill.meta;
  const fm: Record<string, unknown> = { name: skill.ref };
  // Keep `description` right after `name` for visual consistency; the rest of
  // `meta` follows in its original order.
  if (description !== undefined) fm.description = description;
  for (const [k, v] of Object.entries(rest)) fm[k] = v;
  const yaml = stringifyYaml(fm);
  return `---\n${yaml}---\n\n${skill.body}`;
};

export type ParsedSource =
  | { readonly ok: true; readonly ref: string; readonly body: string; readonly meta: Record<string, unknown> }
  | { readonly ok: false; readonly error: string };

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Split the buffer back into `{ ref, body, meta }`, validating the frontmatter. */
export const sourceToSkill = (source: string): ParsedSource => {
  const m = source.match(FRONTMATTER_RE);
  if (!m) return { ok: false, error: "Frontmatter manquant ou mal formé." };
  const [, yamlBlock, rest] = m;

  let fm: unknown;
  try {
    fm = parseYaml(yamlBlock) ?? {};
  } catch (e) {
    return { ok: false, error: `YAML invalide : ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof fm !== "object" || fm === null || Array.isArray(fm)) {
    return { ok: false, error: "Le frontmatter doit être un objet YAML (clé: valeur)." };
  }

  const record = fm as Record<string, unknown>;
  const name = record["name"];
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "Le champ `name` est requis dans le frontmatter." };
  }

  const { name: _drop, ...meta } = record;
  return {
    ok: true,
    ref: name.trim(),
    body: rest.replace(/^\r?\n/, ""), // drop the single blank-line separator
    meta,
  };
};
