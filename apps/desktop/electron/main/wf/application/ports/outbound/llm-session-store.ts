/**
 * Port for reading persisted {@link LlmSessionEvent}s by step execution.
 *
 * The live emission path (text deltas, tool uses, …) goes through
 * {@link LlmSessionBus}; this read-only port is for use-cases that need to
 * pull a full session as a one-shot list, decoupled from the bus's
 * replay/subscribe contract.
 *
 * Implementation: `createSqliteLlmSessionStore` (SQLite
 * `wf_llm_session_events` table).
 */
import type { StepExecId } from "../../../domain/ids";
import type { LlmSessionEvent } from "./event-bus";

export interface LlmSessionStore {
  /**
   * Returns every persisted session event for `stepExecId`, oldest first by
   * `seq`. Empty array when the step exec produced no LLM session (or never
   * ran).
   */
  listByStepExec(stepExecId: StepExecId): Promise<ReadonlyArray<LlmSessionEvent>>;
}
