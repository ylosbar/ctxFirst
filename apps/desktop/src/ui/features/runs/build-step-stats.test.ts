import { describe, expect, it } from "vitest";
import { buildStepStats, formatDurationMs } from "./build-step-stats";
import type {
  InstanceView,
  StepExecutionView,
  TemplateView,
} from "../../../domain/workflow/types";

const ISO = (ms: number) => new Date(ms).toISOString();
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

const exec = (over: Partial<StepExecutionView>): StepExecutionView => ({
  id: "e1",
  stepId: "s1",
  instanceId: "i1",
  status: "validated",
  inputArtifacts: [],
  runs: [],
  startedAt: ISO(T0),
  endedAt: ISO(T0 + 1000),
  ...over,
});

const tpl = (steps: Array<{ id: string; name: string }>): TemplateView => ({
  id: "t",
  version: "1",
  name: "T",
  description: "",
  entryStep: steps[0]?.id ?? "",
  exitSteps: [],
  steps: steps.map((s) => ({
    id: s.id,
    name: s.name,
    kind: "shell.exec",
    actorRole: "Developer",
    humanGateRequired: false,
  })),
  transitions: [],
  variables: [],
  status: "draft",
});

const inst = (executions: ReadonlyArray<StepExecutionView>): InstanceView => ({
  id: "i1",
  templateId: "t",
  templateVersion: "1",
  status: "running",
  seedArtifacts: [],
  executions,
  createdAt: ISO(T0),
  openLoops: [],
});

describe("buildStepStats", () => {
  it("returns the empty model when template is null", () => {
    const model = buildStepStats({ instance: inst([]), template: null });
    expect(model.rows).toEqual([]);
    expect(model.t0Ms).toBe(0);
    expect(model.skippedCount).toBe(0);
    expect(model.summary.wallClockMs).toBe(0);
    expect(model.summary.computeMs).toBe(0);
    expect(model.summary.retriedStepsCount).toBe(0);
    expect(model.summary.humanGatesCount).toBe(0);
  });

  it("returns the empty model when there are no executions", () => {
    const template = tpl([{ id: "s1", name: "Step 1" }]);
    const model = buildStepStats({ instance: inst([]), template });
    expect(model.rows).toEqual([]);
    expect(model.t0Ms).toBe(0);
  });

  it("builds rows for a linear template with 3 validated executions", () => {
    const template = tpl([
      { id: "s1", name: "Spec" },
      { id: "s2", name: "Fetch" },
      { id: "s3", name: "Summarize" },
    ]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        startedAt: ISO(T0),
        endedAt: ISO(T0 + 1000),
      }),
      exec({
        id: "e2",
        stepId: "s2",
        startedAt: ISO(T0 + 1500),
        endedAt: ISO(T0 + 3500),
      }),
      exec({
        id: "e3",
        stepId: "s3",
        startedAt: ISO(T0 + 4000),
        endedAt: ISO(T0 + 6000),
      }),
    ];
    const model = buildStepStats({ instance: inst(executions), template });
    expect(model.rows).toHaveLength(3);
    expect(model.t0Ms).toBe(T0);
    expect(model.rows[0].stepId).toBe("s1");
    expect(model.rows[1].stepId).toBe("s2");
    expect(model.rows[2].stepId).toBe("s3");
    expect(model.rows[1].bars[0]).toMatchObject({
      startMs: 1500,
      durationMs: 2000,
      inProgress: false,
      status: "validated",
    });
  });

  it("uses executionEndedAt for bar duration so human wait time is excluded", () => {
    const template = tpl([{ id: "s1", name: "Spawn" }]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        status: "validated",
        startedAt: ISO(T0),
        executionEndedAt: ISO(T0 + 2000), // compute took 2s
        endedAt: ISO(T0 + 60_000), // human validated 58s later
      }),
    ];
    const model = buildStepStats({ instance: inst(executions), template });
    expect(model.rows[0].bars[0].durationMs).toBe(2000);
    expect(model.summary.computeMs).toBe(2000);
    // Wall-clock includes the human wait.
    expect(model.summary.wallClockMs).toBe(60_000);
  });

  it("freezes the bar at executionEndedAt while awaitingHuman (not inProgress)", () => {
    const template = tpl([{ id: "s1", name: "Step 1" }]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        status: "awaitingHuman",
        startedAt: ISO(T0),
        executionEndedAt: ISO(T0 + 3000),
        endedAt: undefined,
      }),
    ];
    const nowMs = T0 + 20_000;
    const model = buildStepStats({
      instance: inst(executions),
      template,
      nowMs,
    });
    const bar = model.rows[0].bars[0];
    expect(bar.inProgress).toBe(false);
    expect(bar.durationMs).toBe(3000);
  });

  it("uses nowMs for an in-progress exec without endedAt", () => {
    const template = tpl([{ id: "s1", name: "Step 1" }]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        status: "running",
        startedAt: ISO(T0),
        endedAt: undefined,
      }),
    ];
    const nowMs = T0 + 5000;
    const model = buildStepStats({
      instance: inst(executions),
      template,
      nowMs,
    });
    expect(model.rows).toHaveLength(1);
    const bar = model.rows[0].bars[0];
    expect(bar.inProgress).toBe(true);
    expect(bar.durationMs).toBe(5000);
  });

  it("excludes skipped execs from rows but counts them", () => {
    const template = tpl([
      { id: "s1", name: "Step 1" },
      { id: "s2", name: "Step 2" },
    ]);
    const executions = [
      exec({ id: "e1", stepId: "s1" }),
      exec({
        id: "e2",
        stepId: "s2",
        status: "skipped",
        startedAt: undefined,
        endedAt: undefined,
      }),
    ];
    const model = buildStepStats({ instance: inst(executions), template });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0].stepId).toBe("s1");
    expect(model.skippedCount).toBe(1);
  });

  it("excludes pending execs without startedAt, without counting them as skipped", () => {
    const template = tpl([
      { id: "s1", name: "Step 1" },
      { id: "s2", name: "Step 2" },
    ]);
    const executions = [
      exec({ id: "e1", stepId: "s1" }),
      exec({
        id: "e2",
        stepId: "s2",
        status: "pending",
        startedAt: undefined,
        endedAt: undefined,
      }),
    ];
    const model = buildStepStats({ instance: inst(executions), template });
    expect(model.rows).toHaveLength(1);
    expect(model.skippedCount).toBe(0);
  });

  it("groups N execs on the same stepId into one row, sorted by startMs", () => {
    const template = tpl([{ id: "s1", name: "Loop body" }]);
    const executions = [
      exec({
        id: "e2",
        stepId: "s1",
        startedAt: ISO(T0 + 2000),
        endedAt: ISO(T0 + 3000),
      }),
      exec({
        id: "e1",
        stepId: "s1",
        startedAt: ISO(T0),
        endedAt: ISO(T0 + 1000),
      }),
      exec({
        id: "e3",
        stepId: "s1",
        status: "failed",
        startedAt: ISO(T0 + 4000),
        endedAt: ISO(T0 + 5000),
        error: "boom",
      }),
    ];
    const model = buildStepStats({ instance: inst(executions), template });
    expect(model.rows).toHaveLength(1);
    const row = model.rows[0];
    expect(row.bars.map((b) => b.stepExecId)).toEqual(["e1", "e2", "e3"]);
    expect(row.cumulativeMs).toBe(3000);
    expect(row.aggregatedStatus).toBe("failed");
  });

  it("handles retry via loopFrom as 2 bars on the same stepId", () => {
    const template = tpl([{ id: "s1", name: "Step 1" }]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        status: "looped",
        startedAt: ISO(T0),
        endedAt: ISO(T0 + 1000),
      }),
      exec({
        id: "e2",
        stepId: "s1",
        loopFrom: "e1",
        startedAt: ISO(T0 + 1100),
        endedAt: ISO(T0 + 2200),
      }),
    ];
    const model = buildStepStats({ instance: inst(executions), template });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0].bars).toHaveLength(2);
  });

  it("applies a 5% right margin on tEndMs", () => {
    const template = tpl([{ id: "s1", name: "Step 1" }]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        startedAt: ISO(T0),
        endedAt: ISO(T0 + 10_000),
      }),
    ];
    const model = buildStepStats({ instance: inst(executions), template });
    expect(model.tEndMs).toBe(T0 + 10_000 * 1.05);
  });

  it("computes summary stats: wallClock, compute, statusCounts, retries, gates", () => {
    const template = tpl([
      { id: "s1", name: "Spec" },
      { id: "s2", name: "Loop" },
      { id: "s3", name: "Skipped" },
      { id: "s4", name: "Pending" },
    ]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        status: "validated",
        startedAt: ISO(T0),
        endedAt: ISO(T0 + 1000),
        humanFeedback: { summary: "ok", comments: [] },
      }),
      exec({
        id: "e2",
        stepId: "s2",
        status: "looped",
        startedAt: ISO(T0 + 2000),
        endedAt: ISO(T0 + 3000),
      }),
      exec({
        id: "e3",
        stepId: "s2",
        status: "validated",
        loopFrom: "e2",
        startedAt: ISO(T0 + 3500),
        endedAt: ISO(T0 + 5000),
      }),
      exec({
        id: "e4",
        stepId: "s3",
        status: "skipped",
        startedAt: undefined,
        endedAt: undefined,
      }),
      exec({
        id: "e5",
        stepId: "s4",
        status: "pending",
        startedAt: undefined,
        endedAt: undefined,
      }),
    ];
    const model = buildStepStats({ instance: inst(executions), template });
    expect(model.summary.wallClockMs).toBe(5000);
    expect(model.summary.computeMs).toBe(1000 + 1000 + 1500);
    expect(model.summary.retriedStepsCount).toBe(1);
    expect(model.summary.humanGatesCount).toBe(1);
    expect(model.summary.statusCounts).toEqual({
      pending: 1,
      running: 0,
      awaitingHuman: 0,
      validated: 2,
      looped: 1,
      failed: 0,
      skipped: 1,
    });
  });

  it("sorts rows by template.steps order, even when executions arrive out of order", () => {
    const template = tpl([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ]);
    const executions = [
      exec({ id: "e1", stepId: "c" }),
      exec({ id: "e2", stepId: "a" }),
      exec({ id: "e3", stepId: "b" }),
    ];
    const model = buildStepStats({ instance: inst(executions), template });
    expect(model.rows.map((r) => r.stepId)).toEqual(["a", "b", "c"]);
  });
});

describe("formatDurationMs", () => {
  it("formats sub-second values in ms", () => {
    expect(formatDurationMs(0)).toBe("0ms");
    expect(formatDurationMs(123)).toBe("123ms");
    expect(formatDurationMs(999)).toBe("999ms");
  });

  it("formats sub-10-second values with one decimal", () => {
    expect(formatDurationMs(1500)).toBe("1.5s");
    expect(formatDurationMs(9900)).toBe("9.9s");
  });

  it("formats sub-minute values as integer seconds", () => {
    expect(formatDurationMs(12_300)).toBe("12s");
    expect(formatDurationMs(59_000)).toBe("59s");
  });

  it("formats >= 1 minute as m s", () => {
    expect(formatDurationMs(64_000)).toBe("1m 04s");
    expect(formatDurationMs(125_000)).toBe("2m 05s");
  });
});
