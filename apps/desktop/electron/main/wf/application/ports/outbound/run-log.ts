/**
 * Port recording an immutable trace of every LLM invocation made during a
 * workflow. Feeds the cost / latency / token dashboards.
 *
 * Implementation: {@link createSqliteRunLog} (SQLite `wf_runs` table).
 */
import type { RunId, StepExecId } from "../../../domain/ids";

/** Denormalized record of one LLM call. */
export type RunRecord = {
  id: RunId;
  stepExecId: StepExecId;
  provider: string;
  model: string;
  /** Hash of the assembled prompt — used for cache / correlation. */
  promptHash: string;
  tokensIn: number;
  tokensOut: number;
  costUsd?: number;
  latencyMs: number;
  /** Optional {@link ArtifactId} of the produced artifact, as string. */
  outputRef?: string;
  createdAt: string;
};

export interface RunLog {
  /** Persists a single run record. */
  record(run: RunRecord): Promise<void>;
  /** Returns every run associated with a step execution in chronological order. */
  listByStepExec(id: StepExecId): Promise<ReadonlyArray<RunRecord>>;
}
