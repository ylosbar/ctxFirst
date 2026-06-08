import { describe, expect, it } from "vitest";
import { makeGetRunTokenUsage } from "./get-run-token-usage";
import { createFakeRunLog } from "../../__tests__/fixtures/fake-run-log";
import { asRunId, asStepExecId, asWorkflowId } from "../../domain/ids";
import type { EngineState } from "../engine-state";
import type { RunRecord } from "../ports/outbound/run-log";

const wfId = asWorkflowId("wf-1");

// Minimal EngineState stub: the use-case only reads `getInstance(id).executions`
// and each `exec.id`.
const fakeState = (execIds: string[]): EngineState =>
  ({
    getInstance: () =>
      ({
        executions: execIds.map((id) => ({ id: asStepExecId(id) })),
      }) as unknown as ReturnType<EngineState["getInstance"]>,
  }) as unknown as EngineState;

let nextId = 0;
const run = (
  stepExec: string,
  over: Partial<RunRecord> = {},
): RunRecord => ({
  id: asRunId(`run-${nextId++}`),
  stepExecId: asStepExecId(stepExec),
  provider: "claude-code",
  model: "claude-opus-4-7",
  promptHash: "h",
  tokensIn: 0,
  tokensOut: 0,
  latencyMs: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("getRunTokenUsage — cache tokens", () => {
  it("sums cacheCreate / cacheRead across the runs of a step execution", async () => {
    const runLog = createFakeRunLog();
    await runLog.record(
      run("e1", { tokensIn: 10, tokensOut: 5, cacheCreate: 100, cacheRead: 900 }),
    );
    await runLog.record(
      run("e1", { tokensIn: 2, tokensOut: 3, cacheCreate: 0, cacheRead: 50 }),
    );

    const usage = await makeGetRunTokenUsage({ state: fakeState(["e1"]), runLog })(wfId);

    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      tokensIn: 12,
      tokensOut: 8,
      cacheCreate: 100,
      cacheRead: 950,
      runCount: 2,
    });
  });

  it("treats missing cache fields (historical runs) as 0", async () => {
    const runLog = createFakeRunLog();
    // No cacheCreate / cacheRead — a pre-migration record.
    await runLog.record(run("e1", { tokensIn: 7, tokensOut: 1 }));

    const usage = await makeGetRunTokenUsage({ state: fakeState(["e1"]), runLog })(wfId);

    expect(usage[0]).toMatchObject({ cacheCreate: 0, cacheRead: 0 });
  });
});
