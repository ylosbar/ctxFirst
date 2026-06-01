/**
 * Read-only use-case: aggregate token / cost consumption per step execution for
 * one instance. Reads the immutable {@link RunLog} (SQLite `wf_runs`) — one row
 * per LLM call — and sums it by step execution. Feeds the token-usage chart
 * rendered under the run timeline.
 *
 * Executions with no recorded LLM run (parsers, transforms, human gates, …) are
 * omitted entirely, so the renderer only sees steps that actually spent tokens.
 */
import type { StepTokenUsage } from "@shared/wf/token-usage";
import type { EngineState } from "../engine-state";
import type { RunLog } from "../ports/outbound/run-log";
import type { WorkflowId } from "../../domain/ids";

type Deps = { state: EngineState; runLog: RunLog };

export type GetRunTokenUsage = (
  id: WorkflowId,
) => Promise<ReadonlyArray<StepTokenUsage>>;

export const makeGetRunTokenUsage =
  ({ state, runLog }: Deps): GetRunTokenUsage =>
  async (id) => {
    const instance = state.getInstance(id);
    if (!instance) return [];

    const perExec = await Promise.all(
      instance.executions.map(async (exec) => {
        const runs = await runLog.listByStepExec(exec.id);
        if (runs.length === 0) return null;
        let tokensIn = 0;
        let tokensOut = 0;
        let costUsd = 0;
        let hasCost = false;
        for (const run of runs) {
          tokensIn += run.tokensIn;
          tokensOut += run.tokensOut;
          if (run.costUsd != null) {
            costUsd += run.costUsd;
            hasCost = true;
          }
        }
        return {
          stepExecId: exec.id,
          tokensIn,
          tokensOut,
          costUsd: hasCost ? costUsd : undefined,
          runCount: runs.length,
        } satisfies StepTokenUsage;
      }),
    );

    return perExec.filter((u) => u !== null);
  };
