import { describe, expect, it } from "vitest";
import type { TimelineLoopNode, TimelineRow } from "../../timeline-types";
import { groupSubworkflowRuns } from "./group-subworkflow-runs";
import type { RenderItem } from "./render-item";

const row = (stepId: string): TimelineRow => ({
  stepExecId: `exec-${stepId}`,
  stepId,
  label: stepId,
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
});

const step = (stepId: string, depth = 0): RenderItem => ({
  kind: "step",
  row: row(stepId),
  depth,
});

const loopHeader: RenderItem = {
  kind: "loopHeader",
  loop: {
    kind: "loop",
    loopStepId: "L",
    foreach: row("L-fe"),
    collect: null,
    iterations: [],
  } satisfies TimelineLoopNode,
  depth: 0,
};

/** One-line summary of a render item — `<kind>:<key>@<depth>`. */
const summary = (item: RenderItem): string => {
  switch (item.kind) {
    case "step":
      return `step:${item.row.stepId}@${item.depth}`;
    case "loopHeader":
      return `loop:${item.loop.loopStepId}@${item.depth}`;
    case "iterationHeader":
      return `iter:${item.iteration.iterationKey}@${item.depth}`;
    case "subworkflowHeader":
      return `sub:${item.prefix}(${item.count})@${item.depth}`;
  }
};

const group = (
  items: RenderItem[],
  collapsed: ReadonlySet<string> = new Set(),
): string[] => groupSubworkflowRuns(items, collapsed).map(summary);

describe("groupSubworkflowRuns", () => {
  it("wraps a maximal run sharing a prefix under one header and indents members", () => {
    expect(group([step("wf/a"), step("wf/b")])).toEqual([
      "sub:wf(2)@0",
      "step:wf/a@1",
      "step:wf/b@1",
    ]);
  });

  it("breaks a run at a non-step item", () => {
    expect(group([step("wf/a"), loopHeader, step("wf/b")])).toEqual([
      "sub:wf(1)@0",
      "step:wf/a@1",
      "loop:L@0",
      "sub:wf(1)@0",
      "step:wf/b@1",
    ]);
  });

  it("splits adjacent runs of distinct prefixes into separate groups", () => {
    expect(group([step("a/x"), step("b/y")])).toEqual([
      "sub:a(1)@0",
      "step:a/x@1",
      "sub:b(1)@0",
      "step:b/y@1",
    ]);
  });

  it("keeps the header but hides members when the group is collapsed", () => {
    expect(group([step("wf/a"), step("wf/b")], new Set(["sub:wf"]))).toEqual([
      "sub:wf(2)@0",
    ]);
  });

  it("leaves host-local steps (no namespace) untouched", () => {
    expect(group([step("a"), step("b")])).toEqual(["step:a@0", "step:b@0"]);
  });
});
