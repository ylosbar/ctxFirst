/**
 * Assembler that composes an LLM prompt from the value of an `claude_code.invoke`
 * step's `prompt` input port and optional loop history. Returns the prompt
 * pair along with a stable hash of the assembled content used as a run-log
 * correlation / cache key.
 *
 * Lives in `application/services/` (not `domain/`) because the hash relies
 * on a {@link HashPort} provided by the caller — the prompt formatting itself
 * is deterministic and side-effect free, but hashing is a platform concern.
 */
import type { HashPort } from "../ports/outbound/hash";

/** A single line-anchored review comment, expanded with its cited lines. */
export type LoopHistoryComment = {
  startLine: number;
  endLine: number;
  body: string;
};

/** One prior attempt at a step, to be re-injected as feedback. */
export type LoopHistoryEntry = {
  /** The output the human rejected. */
  previousOutput: string;
  /** Structured feedback (summary + line-anchored comments). */
  humanFeedback: {
    summary: string;
    comments: ReadonlyArray<LoopHistoryComment>;
  };
};

/** Parameters for {@link assemble}. */
export type AssembleInput = {
  /** Value of the `claude_code.invoke` step's `prompt` input port. */
  prompt: string;
  /** Ordered feedback loops applied to this step (oldest first). */
  loopHistory: ReadonlyArray<LoopHistoryEntry>;
  /** Project-wide rules injected before the prompt. */
  projectContext?: string;
};

/** Result of {@link assemble}. `hash` is used as a cache/correlation key. */
export type AssembledContext = {
  systemPrompt: string;
  userPrompt: string;
  hash: string;
};

const renderComment = (
  previousOutput: string,
  comment: LoopHistoryComment,
): string => {
  const lines = previousOutput.split("\n");
  const start = Math.max(1, Math.floor(comment.startLine));
  const end = Math.max(start, Math.min(lines.length, Math.floor(comment.endLine)));
  const cited = lines.slice(start - 1, end).map((l) => `  > ${l}`).join("\n");
  const range = start === end ? `L${start}` : `L${start}-L${end}`;
  return `- ${range} :\n${cited}\n  ${comment.body.trim()}`;
};

const renderLoopEntry = (entry: LoopHistoryEntry, index: number): string => {
  const parts: string[] = [
    `### Tentative ${index + 1}`,
    "",
    "**Sortie précédente :**",
    "",
    entry.previousOutput.trim(),
  ];
  const summary = entry.humanFeedback.summary.trim();
  if (summary) {
    parts.push("", "**Feedback humain :**", "", summary);
  }
  if (entry.humanFeedback.comments.length > 0) {
    const rendered = entry.humanFeedback.comments
      .map((c) => renderComment(entry.previousOutput, c))
      .join("\n");
    parts.push("", "**Commentaires par ligne :**", "", rendered);
  }
  return parts.join("\n");
};

/**
 * Builds the `{ systemPrompt, userPrompt, hash }` triple sent to the LLM.
 *
 * - `systemPrompt` = empty (the runner no longer derives a system prompt from
 *                    a Skill; everything goes through the user prompt).
 * - `userPrompt`   = `prompt` (the port value), optionally prefixed with
 *                    `## Règles projet` and suffixed with
 *                    `## Historique de boucle`.
 * - `hash`         = SHA-256 of `system + " " + user`, stable across runs,
 *                    computed by the injected {@link HashPort}.
 */
export const assemble = (
  input: AssembleInput,
  hashPort: HashPort,
): AssembledContext => {
  const systemPrompt = "";
  const sections: string[] = [];
  if (input.projectContext && input.projectContext.trim()) {
    sections.push("## Règles projet\n\n" + input.projectContext.trim());
  }
  const body = input.prompt.trim();
  if (body) {
    sections.push(body);
  }
  if (input.loopHistory.length > 0) {
    const rendered = input.loopHistory.map(renderLoopEntry).join("\n\n");
    sections.push("## Historique de boucle\n\n" + rendered);
  }
  const userPrompt = sections.join("\n\n");
  const hash = hashPort.sha256([systemPrompt, " ", userPrompt]);
  return { systemPrompt, userPrompt, hash };
};
