import { describe, expect, it } from "vitest";
import type { TimelineLoopNode, TimelineRow } from "../../timeline-types";
import { collectCollapsibleKeys, flattenNodes } from "./flatten-nodes";
import type { RenderItem } from "./render-item";

const row = (
  over: Partial<TimelineRow> & { stepExecId: string },
): TimelineRow => ({
  stepId: over.stepExecId,
  label: over.stepExecId,
  status: "validated",
  startedAtMs: 0,
  durationMs: 0,
  inProgress: false,
  hasHumanGate: false,
  hasError: false,
  errorMessage: null,
  feedbackSummary: null,
  feedbackCommentCount: 0,
  retryOfStepExecId: null,
  templateStepOrder: 0,
  iterationIndex: 1,
  childInstanceId: null,
  ...over,
});

/** One-line summary of a flattened item — `<kind>:<key>@<depth>`. */
const summary = (item: RenderItem): string => {
  switch (item.kind) {
    case "step":
      return `step:${item.row.stepExecId}@${item.depth}`;
    case "loopHeader":
      return `loop:${item.loop.loopStepId}@${item.depth}`;
    case "iterationHeader":
      return `iter:${item.iteration.iterationKey}@${item.depth}`;
    case "subworkflowHeader":
      return `sub:${item.prefix}@${item.depth}`;
  }
};

const flatten = (
  nodes: Parameters<typeof flattenNodes>[0],
  collapsed: ReadonlySet<string> = new Set(),
): string[] => {
  const out: RenderItem[] = [];
  flattenNodes(nodes, 0, collapsed, out);
  return out.map(summary);
};

/** A foreach loop with one iteration of one step, plus a collect bracket. */
const loopWithIteration = (): TimelineLoopNode => ({
  kind: "loop",
  loopStepId: "L",
  foreach: row({ stepExecId: "L-fe" }),
  collect: row({ stepExecId: "L-collect" }),
  iterations: [
    {
      kind: "iteration",
      iterationKey: "L:0",
      index: 0,
      children: [{ kind: "step", row: row({ stepExecId: "c0" }) }],
    },
  ],
});

describe("flattenNodes", () => {
  it("emits a single step at the given depth", () => {
    expect(flatten([{ kind: "step", row: row({ stepExecId: "a" }) }])).toEqual([
      "step:a@0",
    ]);
  });

  it("expands a loop: header, nested iteration + children, then collect at the loop's depth", () => {
    expect(flatten([loopWithIteration()])).toEqual([
      "loop:L@0",
      "iter:L:0@1",
      "step:c0@2",
      "step:L-collect@0",
    ]);
  });

  it("collapses a loop body but always keeps the collect bracket", () => {
    expect(flatten([loopWithIteration()], new Set(["L"]))).toEqual([
      "loop:L@0",
      "step:L-collect@0",
    ]);
  });

  it("collapses an iteration body while keeping its header and the collect", () => {
    expect(flatten([loopWithIteration()], new Set(["L:0"]))).toEqual([
      "loop:L@0",
      "iter:L:0@1",
      "step:L-collect@0",
    ]);
  });
});

describe("collectCollapsibleKeys", () => {
  it("lists loops then their iterations in render order", () => {
    const out: string[] = [];
    collectCollapsibleKeys([loopWithIteration()], out);
    expect(out).toEqual(["L", "L:0"]);
  });

  it("ignores plain steps", () => {
    const out: string[] = [];
    collectCollapsibleKeys([{ kind: "step", row: row({ stepExecId: "a" }) }], out);
    expect(out).toEqual([]);
  });
});
