import {
  isSumArtifactKind,
  parseSumArtifactKind,
} from "@shared/wf/artifact-kind-grammar";

/**
 * Tolerant read of a `branch.match.targetKind`: returns the parsed variants
 * when the encoding is valid, otherwise tries a shallow split at top level
 * so that intermediate edits (empty cell, duplicate) round-trip through the
 * editor. Falls back to two empty slots when the field is missing — the
 * minimum a `OneOf<…>` admits.
 */
export const readBranchMatchVariants = (raw: unknown): string[] => {
  if (typeof raw !== "string" || raw.length === 0) return ["", ""];
  if (isSumArtifactKind(raw)) {
    const parsed = parseSumArtifactKind(raw);
    if (parsed) return [...parsed];
    const inner = raw.slice("OneOf<".length, -1);
    return splitTopLevel(inner);
  }
  return ["", ""];
};

/**
 * Split a comma-separated `OneOf<…>` body at top-level commas, respecting
 * nested chevrons. Mirror of the private helper in `artifact-kind-grammar.ts`
 * — kept local so the editor can read malformed-but-recoverable intermediate
 * states (the strict parser refuses them outright).
 */
export const splitTopLevel = (body: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "<") depth++;
    else if (c === ">") depth--;
    else if (c === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  while (parts.length < 2) parts.push("");
  return parts;
};

export const encodeOneOf = (variants: ReadonlyArray<string>): string =>
  `OneOf<${variants.join(",")}>`;
