import { describe, expect, it } from "vitest";
import { asStepId, asTemplateId, asTemplateVersion } from "../ids";
import type { StepDef, Transition, WorkflowTemplate } from "../template";
import { canLoop, isExit, nextStep } from "./transition-policy";

const step = (id: string): StepDef => ({
  id: asStepId(id),
  name: id,
  kind: "user.input",
  actorRole: "PO",
  config: {},
  inputKinds: [],
  outputKind: "Markdown",
  humanGateRequired: false,
});

const edge = (from: string, to: string, isLoop = false): Transition => ({
  from: asStepId(from),
  to: asStepId(to),
  isLoop,
});

const tpl: WorkflowTemplate = {
  id: asTemplateId("t"),
  name: "t",
  description: "",
  version: asTemplateVersion("v1"),
  entryStep: asStepId("a"),
  exitSteps: [asStepId("c")],
  steps: [step("a"), step("b"), step("c")],
  transitions: [edge("a", "b"), edge("b", "c"), edge("c", "b", true)],
  variables: [],
  status: "published",
};

describe("nextStep", () => {
  it("follows the unique forward edge", () => {
    expect(nextStep(tpl, asStepId("a"))).toBe("b");
    expect(nextStep(tpl, asStepId("b"))).toBe("c");
  });

  it("ignores loop edges", () => {
    expect(nextStep(tpl, asStepId("c"))).toBeNull();
  });

  it("returns null when no outgoing edge exists", () => {
    const empty: WorkflowTemplate = { ...tpl, transitions: [] };
    expect(nextStep(empty, asStepId("a"))).toBeNull();
  });
});

describe("canLoop", () => {
  it("is true only for declared loop edges", () => {
    expect(canLoop(tpl, asStepId("c"), asStepId("b"))).toBe(true);
  });

  it("is false for forward edges, even if they exist", () => {
    expect(canLoop(tpl, asStepId("a"), asStepId("b"))).toBe(false);
  });

  it("is false for non-existent edges", () => {
    expect(canLoop(tpl, asStepId("a"), asStepId("c"))).toBe(false);
  });
});

describe("isExit", () => {
  it("recognizes declared exit steps", () => {
    expect(isExit(tpl, asStepId("c"))).toBe(true);
  });

  it("rejects non-exit steps", () => {
    expect(isExit(tpl, asStepId("a"))).toBe(false);
    expect(isExit(tpl, asStepId("b"))).toBe(false);
  });
});
