import type { ActorRole } from "../../../../../domain/workflow/types";

export const ACTOR_ROLES: ReadonlyArray<ActorRole> = [
  "PO",
  "Developer",
  "LLMAgent",
];

/**
 * Output kinds proposés par le node `file.load`. Restreint aux kinds
 * text-envelope (un fichier est du texte) — cf. `FILE_LOAD_FORMATS` côté runner.
 */
export const FILE_LOAD_OUTPUT_KINDS = ["Markdown", "Json"] as const;

export const CASE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
