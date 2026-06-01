/**
 * Helpers for the `llm.judge` step kind — see
 * `specs/llm-judge-bounded-retries.md`. Two responsibilities:
 *
 *  1. {@link parseJudgeJson}   — parse the LLM's raw JSON verdict into a
 *     typed {@link JudgeOutput}. Strict; throws on shape mismatch.
 *  2. {@link renderJudgeFeedback} / {@link parseJudgeFeedback} — round-trip
 *     the verdict to a human-readable Markdown body. The runner emits the
 *     rendered form on the `rejected` / `exhausted` ports; `buildLoopHistory`
 *     re-parses it so the assembler can render line-anchored comments in the
 *     next prompt.
 */
import type { ReviewComment } from "./feedback";

export type JudgeVerdict = "approved" | "rejected";

export type JudgeOutput = {
  verdict: JudgeVerdict;
  summary: string;
  comments: ReadonlyArray<ReviewComment>;
};

/** Author string used when the orchestrator auto-opens a loop on a judge's port. */
export const judgeLoopAuthor = (stepId: string): string => `llm.judge:${stepId}`;

/** True iff the given `LoopOpened.author` value was emitted by a judge. */
export const isJudgeAuthor = (author: string): boolean =>
  author.startsWith("llm.judge:");

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Parses the JSON returned by the judge LLM. Tolerant of extra whitespace and
 * a leading/trailing markdown code fence (LLMs frequently wrap JSON in
 * ```json blocks). Strict on the resulting shape — anything off throws so the
 * orchestrator surfaces a `StepFailed` rather than retrying on garbage.
 */
export const parseJudgeJson = (raw: string): JudgeOutput => {
  const stripped = stripCodeFence(raw.trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(
      `llm.judge: LLM output is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error("llm.judge: LLM output must be a JSON object");
  }
  const verdictRaw = parsed["verdict"];
  if (verdictRaw !== "approved" && verdictRaw !== "rejected") {
    throw new Error(
      `llm.judge: invalid verdict "${String(verdictRaw)}" (expected "approved" | "rejected")`,
    );
  }
  const summaryRaw = parsed["summary"];
  if (typeof summaryRaw !== "string") {
    throw new Error("llm.judge: missing or invalid `summary` (expected string)");
  }
  const commentsRaw = parsed["comments"];
  const comments: ReviewComment[] = [];
  if (commentsRaw !== undefined) {
    if (!Array.isArray(commentsRaw)) {
      throw new Error("llm.judge: `comments` must be an array when present");
    }
    for (const c of commentsRaw) {
      if (!isPlainObject(c)) {
        throw new Error("llm.judge: each comment must be an object");
      }
      const anchor = c["anchor"];
      const body = c["body"];
      if (!isPlainObject(anchor)) {
        throw new Error("llm.judge: comment.anchor must be an object");
      }
      const startLine = anchor["startLine"];
      const endLine = anchor["endLine"];
      if (typeof startLine !== "number" || typeof endLine !== "number") {
        throw new Error("llm.judge: comment.anchor.{startLine,endLine} must be numbers");
      }
      if (typeof body !== "string") {
        throw new Error("llm.judge: comment.body must be a string");
      }
      const sn = Math.max(1, Math.floor(startLine));
      const en = Math.max(sn, Math.floor(endLine));
      comments.push({ anchor: { startLine: sn, endLine: en }, body });
    }
  }
  return { verdict: verdictRaw, summary: summaryRaw, comments };
};

const CODE_FENCE_RE = /^```(?:json)?\s*\n([\s\S]*?)\n```$/;

const stripCodeFence = (s: string): string => {
  const m = CODE_FENCE_RE.exec(s);
  return m ? m[1] : s;
};

/**
 * Renders a {@link JudgeOutput} as a Markdown body intended to be persisted
 * as an artifact and shown in the runs panel. The format is intentionally
 * regular so {@link parseJudgeFeedback} can re-extract `{summary, comments}`.
 */
export const renderJudgeFeedback = (output: JudgeOutput): string => {
  const lines: string[] = [];
  lines.push(`## Verdict : ${output.verdict}`);
  lines.push("");
  lines.push(output.summary.trim());
  if (output.comments.length > 0) {
    lines.push("");
    lines.push("## Commentaires");
    lines.push("");
    for (const c of output.comments) {
      const range =
        c.anchor.startLine === c.anchor.endLine
          ? `L${c.anchor.startLine}`
          : `L${c.anchor.startLine}-L${c.anchor.endLine}`;
      lines.push(`- ${range} : ${c.body.trim()}`);
    }
  }
  return lines.join("\n");
};

const COMMENT_RE = /^-\s+L(\d+)(?:-L(\d+))?\s*:\s*(.+?)\s*$/;

/**
 * Reverse of {@link renderJudgeFeedback}. Best-effort: when the parser fails
 * to identify the structured sections (e.g. the LLM produced free-form prose),
 * it returns the entire body as `summary` with `comments: []`. Never throws.
 */
export const parseJudgeFeedback = (
  markdown: string,
): { summary: string; comments: ReadonlyArray<ReviewComment> } => {
  const text = markdown.replace(/^## Verdict :[^\n]*\n+/, "");
  const idx = text.indexOf("## Commentaires");
  const summary = (idx === -1 ? text : text.slice(0, idx)).trim();
  if (idx === -1) {
    return { summary, comments: [] };
  }
  const commentBlock = text.slice(idx + "## Commentaires".length).trim();
  const comments: ReviewComment[] = [];
  for (const line of commentBlock.split("\n")) {
    const m = COMMENT_RE.exec(line.trim());
    if (!m) continue;
    const startLine = Number.parseInt(m[1], 10);
    const endLine = m[2] ? Number.parseInt(m[2], 10) : startLine;
    comments.push({
      anchor: { startLine, endLine },
      body: m[3],
    });
  }
  return { summary, comments };
};
