/**
 * Per-step-execution token consumption, aggregated from the `wf_runs` log.
 * Crosses the main ↔ renderer boundary via `wf:getRunTokenUsage`. The renderer
 * joins these totals with `InstanceView.executions` (for timing / ordering) to
 * plot the token-usage chart under the run timeline.
 */
export type StepTokenUsage = {
  readonly stepExecId: string;
  /** Sum of input tokens across every LLM run of this step execution. */
  readonly tokensIn: number;
  /** Sum of output tokens across every LLM run of this step execution. */
  readonly tokensOut: number;
  /** Sum of USD cost when the provider reports it; `undefined` if none did. */
  readonly costUsd?: number;
  /** Number of LLM runs aggregated (a retried/looped step can have several). */
  readonly runCount: number;
};
