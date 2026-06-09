import { describe, expect, it } from "vitest";
import { buildTimeline } from "./build-timeline";
import type {
  InstanceView,
  StepExecutionView,
  StepKindId,
  TemplateView,
} from "../../../domain/workflow/types";
import type { TimelineNode, TimelineRow } from "./timeline-types";

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

const tpl = (
  steps: Array<{ id: string; name: string; kind?: StepKindId }>,
): TemplateView => ({
  id: "t",
  version: "1",
  name: "T",
  description: "",
  entryStep: steps[0]?.id ?? "",
  exitSteps: [],
  steps: steps.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind ?? "shell.exec",
    actorRole: "Developer",
    humanGateRequired: false,
  })),
  transitions: [],
  variables: [],
  status: "draft",
});

/** Flatten the node tree into its step rows, depth-first (render order). */
const stepRows = (nodes: ReadonlyArray<TimelineNode>): TimelineRow[] => {
  const out: TimelineRow[] = [];
  for (const node of nodes) {
    if (node.kind === "step") out.push(node.row);
    else if (node.kind === "loop") {
      out.push(node.foreach);
      out.push(...stepRows(node.iterations));
      if (node.collect) out.push(node.collect);
    } else out.push(...stepRows(node.children));
  }
  return out;
};

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

describe("buildTimeline", () => {
  it("returns the empty model when there are no executions", () => {
    const template = tpl([{ id: "s1", name: "Step 1" }]);
    const model = buildTimeline({ instance: inst([]), template });
    expect(model.nodes).toEqual([]);
    expect(model.gaps).toEqual([]);
    expect(model.skipped).toEqual([]);
    expect(model.t0Ms).toBe(0);
  });

  it("builds rows for a linear run with 3 executions, sorted by startedAtMs", () => {
    const template = tpl([
      { id: "s1", name: "Spec" },
      { id: "s2", name: "Fetch" },
      { id: "s3", name: "Summarize" },
    ]);
    const executions = [
      exec({
        id: "e3",
        stepId: "s3",
        startedAt: ISO(T0 + 4000),
        endedAt: ISO(T0 + 6000),
      }),
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
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    const rows = stepRows(model.nodes);
    expect(model.nodes).toHaveLength(3);
    expect(model.nodes.every((n) => n.kind === "step")).toBe(true);
    expect(rows.map((r) => r.stepExecId)).toEqual(["e1", "e2", "e3"]);
    expect(rows[0]).toMatchObject({
      label: "Spec",
      durationMs: 1000,
      iterationIndex: 1,
      inProgress: false,
      hasError: false,
      retryOfStepExecId: null,
    });
    expect(model.gaps).toEqual([]);
    expect(model.skipped).toEqual([]);
  });

  it("uses stepId as label fallback when template is null", () => {
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        startedAt: ISO(T0),
        endedAt: ISO(T0 + 500),
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template: null });
    const rows = stepRows(model.nodes);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("s1");
  });

  it("increments iterationIndex per stepId for retries via loopFrom", () => {
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
        startedAt: ISO(T0 + 1200),
        endedAt: ISO(T0 + 2200),
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    const rows = stepRows(model.nodes);
    expect(rows).toHaveLength(2);
    expect(rows[0].iterationIndex).toBe(1);
    expect(rows[0].retryOfStepExecId).toBeNull();
    expect(rows[1].iterationIndex).toBe(2);
    expect(rows[1].retryOfStepExecId).toBe("e1");
  });

  it("inserts a humanWait gap when executionEndedAt precedes endedAt by more than threshold", () => {
    const template = tpl([
      { id: "s1", name: "Review" },
      { id: "s2", name: "Commit" },
    ]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        status: "validated",
        startedAt: ISO(T0),
        executionEndedAt: ISO(T0 + 3000),
        endedAt: ISO(T0 + 60_000),
        humanFeedback: { summary: "ok", comments: [] },
      }),
      exec({
        id: "e2",
        stepId: "s2",
        startedAt: ISO(T0 + 60_100),
        endedAt: ISO(T0 + 61_000),
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    const rows = stepRows(model.nodes);
    expect(model.gaps).toHaveLength(1);
    expect(model.gaps[0]).toMatchObject({
      afterStepExecId: "e1",
      kind: "humanWait",
    });
    expect(model.gaps[0].durationMs).toBeCloseTo(100);
    expect(rows[0].hasHumanGate).toBe(true);
    // Duration covers compute only (executionEndedAt - startedAt).
    expect(rows[0].durationMs).toBe(3000);
  });

  it("ignores idle gaps below the 2s threshold", () => {
    const template = tpl([
      { id: "s1", name: "A" },
      { id: "s2", name: "B" },
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
        startedAt: ISO(T0 + 1100),
        endedAt: ISO(T0 + 2100),
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    expect(model.gaps).toEqual([]);
  });

  it("emits an idle gap above the 2s threshold", () => {
    const template = tpl([
      { id: "s1", name: "A" },
      { id: "s2", name: "B" },
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
        startedAt: ISO(T0 + 5000),
        endedAt: ISO(T0 + 6000),
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    expect(model.gaps).toHaveLength(1);
    expect(model.gaps[0]).toMatchObject({
      afterStepExecId: "e1",
      kind: "idle",
      durationMs: 4000,
    });
  });

  it("excludes skipped execs from rows and lists them in skipped[] ordered by template position", () => {
    const template = tpl([
      { id: "s1", name: "First" },
      { id: "s2", name: "Skipped A" },
      { id: "s3", name: "Skipped B" },
    ]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        startedAt: ISO(T0),
        endedAt: ISO(T0 + 1000),
      }),
      exec({
        id: "e3",
        stepId: "s3",
        status: "skipped",
        startedAt: undefined,
        endedAt: undefined,
      }),
      exec({
        id: "e2",
        stepId: "s2",
        status: "skipped",
        startedAt: undefined,
        endedAt: undefined,
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    expect(stepRows(model.nodes)).toHaveLength(1);
    expect(model.skipped).toHaveLength(2);
    expect(model.skipped.map((s) => s.stepId)).toEqual(["s2", "s3"]);
    expect(model.skipped[0].label).toBe("Skipped A");
  });

  it("marks the last in-progress row and freezes its duration to 0 (live applied at render)", () => {
    const template = tpl([{ id: "s1", name: "Running" }]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        status: "running",
        startedAt: ISO(T0),
        endedAt: undefined,
        executionEndedAt: undefined,
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    const rows = stepRows(model.nodes);
    expect(rows).toHaveLength(1);
    expect(rows[0].inProgress).toBe(true);
    // The model is `now`-independent: an in-progress row carries 0 here and the
    // live elapsed is computed from `startedAtMs` at render.
    expect(rows[0].durationMs).toBe(0);
    expect(rows[0].startedAtMs).toBe(T0);
  });

  it("does not mark an awaitingHuman exec as in progress", () => {
    const template = tpl([{ id: "s1", name: "Awaiting" }]);
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
    const model = buildTimeline({ instance: inst(executions), template });
    const rows = stepRows(model.nodes);
    expect(rows[0].inProgress).toBe(false);
    // Compute duration is fixed at executionEndedAt — never `now`-bound.
    expect(rows[0].durationMs).toBe(3000);
    expect(rows[0].hasHumanGate).toBe(true);
  });

  it("captures the error message and flags hasError on failed rows", () => {
    const template = tpl([{ id: "s1", name: "Boom" }]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        status: "failed",
        startedAt: ISO(T0),
        endedAt: ISO(T0 + 500),
        error: "HTTP 401: invalid token",
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    const rows = stepRows(model.nodes);
    expect(rows[0].hasError).toBe(true);
    expect(rows[0].errorMessage).toBe("HTTP 401: invalid token");
  });

  it("derives feedbackSummary from a non-empty humanFeedback.summary", () => {
    const template = tpl([{ id: "s1", name: "Review" }]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        humanFeedback: { summary: "trop long, recentrer", comments: [] },
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    const rows = stepRows(model.nodes);
    expect(rows[0].feedbackSummary).toBe("trop long, recentrer");
    expect(rows[0].feedbackCommentCount).toBe(0);
  });

  it("falls back to comment count when summary is empty", () => {
    const template = tpl([{ id: "s1", name: "Review" }]);
    const executions = [
      exec({
        id: "e1",
        stepId: "s1",
        humanFeedback: {
          summary: "   ",
          comments: [
            { anchor: { startLine: 1, endLine: 1 }, body: "a" },
            { anchor: { startLine: 2, endLine: 2 }, body: "b" },
          ],
        },
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    const rows = stepRows(model.nodes);
    expect(rows[0].feedbackSummary).toBeNull();
    expect(rows[0].feedbackCommentCount).toBe(2);
  });

  it("leaves feedback fields empty when there is no humanFeedback", () => {
    const template = tpl([{ id: "s1", name: "Step" }]);
    const executions = [exec({ id: "e1", stepId: "s1" })];
    const model = buildTimeline({ instance: inst(executions), template });
    const rows = stepRows(model.nodes);
    expect(rows[0].feedbackSummary).toBeNull();
    expect(rows[0].feedbackCommentCount).toBe(0);
  });

  // ── Tree assembly (loops) ─────────────────────────────────────────────────

  const loopTpl = () =>
    tpl([
      { id: "fetch", name: "Fetch", kind: "shell.exec" },
      { id: "loop", name: "Foreach issue", kind: "loop.foreach" },
      { id: "draft", name: "Draft", kind: "shell.exec" },
      { id: "review", name: "Review", kind: "shell.exec" },
      { id: "collect", name: "Collect", kind: "loop.collect" },
    ]);

  it("groups loop body execs into iteration nodes by iterationKey", () => {
    const template = loopTpl();
    let ms = T0;
    const next = () => {
      const at = ms;
      ms += 1000;
      return at;
    };
    const e = (
      id: string,
      stepId: string,
      iterationKey?: string,
    ): StepExecutionView => {
      const startedAt = ISO(next());
      return exec({ id, stepId, iterationKey, startedAt, endedAt: ISO(ms) });
    };
    const executions = [
      e("e0", "fetch"),
      e("eF", "loop"),
      e("e1", "draft", "loop:1"),
      e("e2", "review", "loop:1"),
      e("e3", "draft", "loop:2"),
      e("e4", "review", "loop:2"),
      e("eC", "collect"),
    ];
    const model = buildTimeline({ instance: inst(executions), template });

    expect(model.nodes).toHaveLength(2);
    expect(model.nodes[0].kind).toBe("step");

    const loop = model.nodes[1];
    expect(loop.kind).toBe("loop");
    if (loop.kind !== "loop") throw new Error("expected loop node");
    expect(loop.loopStepId).toBe("loop");
    expect(loop.foreach.stepExecId).toBe("eF");
    expect(loop.collect?.stepExecId).toBe("eC");
    expect(loop.iterations).toHaveLength(2);
    expect(loop.iterations.map((it) => it.index)).toEqual([1, 2]);
    expect(loop.iterations[0].children).toHaveLength(2);
    expect(loop.iterations[1].children).toHaveLength(2);
    expect(stepRows(loop.iterations[0].children).map((r) => r.stepExecId)).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("leaves collect null for a loop still in progress", () => {
    const template = loopTpl();
    const executions = [
      exec({ id: "eF", stepId: "loop", startedAt: ISO(T0), endedAt: ISO(T0 + 100) }),
      exec({
        id: "e1",
        stepId: "draft",
        iterationKey: "loop:1",
        startedAt: ISO(T0 + 200),
        endedAt: ISO(T0 + 1200),
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    const loop = model.nodes[0];
    expect(loop.kind).toBe("loop");
    if (loop.kind !== "loop") throw new Error("expected loop node");
    expect(loop.collect).toBeNull();
    expect(loop.iterations).toHaveLength(1);
    expect(loop.iterations[0].children).toHaveLength(1);
  });

  it("nests a body-step retry in the same iteration", () => {
    const template = loopTpl();
    const executions = [
      exec({ id: "eF", stepId: "loop", startedAt: ISO(T0), endedAt: ISO(T0 + 100) }),
      exec({
        id: "e1",
        stepId: "review",
        status: "looped",
        iterationKey: "loop:1",
        startedAt: ISO(T0 + 200),
        endedAt: ISO(T0 + 1200),
      }),
      exec({
        id: "e2",
        stepId: "review",
        loopFrom: "e1",
        iterationKey: "loop:1",
        startedAt: ISO(T0 + 1300),
        endedAt: ISO(T0 + 2300),
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    const loop = model.nodes[0];
    if (loop.kind !== "loop") throw new Error("expected loop node");
    expect(loop.iterations).toHaveLength(1);
    const rows = stepRows(loop.iterations[0].children);
    expect(rows.map((r) => r.stepExecId)).toEqual(["e1", "e2"]);
    expect(rows[1].retryOfStepExecId).toBe("e1");
  });

  it("degrades an orphan iterationKey to a top-level step row", () => {
    const template = loopTpl();
    const executions = [
      exec({
        id: "e1",
        stepId: "draft",
        iterationKey: "loop:1",
        startedAt: ISO(T0),
        endedAt: ISO(T0 + 1000),
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template });
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].kind).toBe("step");
  });

  it("produces a flat list of step nodes when template is null", () => {
    const executions = [
      exec({
        id: "e1",
        stepId: "draft",
        iterationKey: "loop:1",
        startedAt: ISO(T0),
        endedAt: ISO(T0 + 1000),
      }),
      exec({
        id: "e2",
        stepId: "fetch",
        startedAt: ISO(T0 + 1100),
        endedAt: ISO(T0 + 2100),
      }),
    ];
    const model = buildTimeline({ instance: inst(executions), template: null });
    expect(model.nodes.every((n) => n.kind === "step")).toBe(true);
    expect(model.nodes).toHaveLength(2);
  });
});
