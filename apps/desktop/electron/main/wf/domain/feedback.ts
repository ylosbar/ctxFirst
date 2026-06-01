/**
 * A {@link FeedbackLoop} records a human-initiated return from a downstream
 * step (`fromStepExec`) to an upstream step (`toStepId`) with a reason that
 * feeds back into the next invocation of the target step via the
 * `ContextAssembler`'s loop-history section.
 */
import type { LoopId, StepExecId, StepId, WorkflowId } from "./ids";

/**
 * Anchors a comment on a (1-indexed, inclusive) line range of the artifact
 * being reviewed. Numbers are stable because artifacts are immutable and
 * content-addressed.
 */
export type ReviewAnchor = {
  startLine: number;
  endLine: number;
};

/** A comment anchored on a line range of an artifact. */
export type ReviewComment = {
  anchor: ReviewAnchor;
  body: string;
};

/**
 * Structured feedback attached to a `LoopOpened` event. `summary` plays the
 * role of the original free-form `reason: string`; `comments` is the ordered
 * list of line-anchored comments (insertion order).
 */
export type ReviewFeedback = {
  summary: string;
  comments: ReadonlyArray<ReviewComment>;
};

/**
 * @property reason Free-form feedback (review summary) re-injected as
 *                  `## Historique de boucle` in the next prompt.
 * @property comments Optional line-anchored comments collected during a
 *                    GitHub-style review.
 * @property closedAt Set when the target step has re-produced an output.
 */
export type FeedbackLoop = {
  id: LoopId;
  instanceId: WorkflowId;
  fromStepExec: StepExecId;
  toStepId: StepId;
  reason: string;
  comments?: ReadonlyArray<ReviewComment>;
  author: string;
  openedAt: string;
  closedAt?: string;
};
