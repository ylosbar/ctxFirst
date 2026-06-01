import { describe, expect, it } from "vitest";
import {
  asStepId,
  asTemplateId,
  asTemplateVersion,
} from "./ids";
import {
  TemplateError,
  findStep,
  validateTemplate,
  type StepDef,
  type TemplateVariable,
  type Transition,
  type WorkflowTemplate,
} from "./template";

const step = (id: string, overrides: Partial<StepDef> = {}): StepDef => ({
  id: asStepId(id),
  name: id,
  kind: "user.input",
  actorRole: "PO",
  config: {},
  inputKinds: [],
  outputKind: "Markdown",
  humanGateRequired: false,
  ...overrides,
});

const edge = (from: string, to: string, isLoop = false): Transition => ({
  from: asStepId(from),
  to: asStepId(to),
  isLoop,
});

const template = (over: Partial<WorkflowTemplate> = {}): WorkflowTemplate => ({
  id: asTemplateId("t"),
  name: "t",
  description: "",
  version: asTemplateVersion("v1"),
  entryStep: asStepId("a"),
  exitSteps: [asStepId("b")],
  steps: [step("a"), step("b", { kind: "human.gate" })],
  transitions: [edge("a", "b")],
  variables: [],
  status: "draft",
  ...over,
});

describe("validateTemplate", () => {
  it("accepts a minimal linear DAG", () => {
    expect(() => validateTemplate(template())).not.toThrow();
  });

  it("accepts a loop edge that would otherwise form a cycle", () => {
    const tpl = template({
      steps: [step("a"), step("b"), step("c", { kind: "human.gate" })],
      transitions: [edge("a", "b"), edge("b", "c"), edge("c", "b", true)],
      exitSteps: [asStepId("c")],
    });
    expect(() => validateTemplate(tpl)).not.toThrow();
  });

  it("rejects an entryStep that is not in steps", () => {
    const tpl = template({ entryStep: asStepId("ghost") });
    expect(() => validateTemplate(tpl)).toThrow(TemplateError);
    expect(() => validateTemplate(tpl)).toThrow(/entryStep/);
  });

  it("rejects an exitStep that is not in steps", () => {
    const tpl = template({ exitSteps: [asStepId("ghost")] });
    expect(() => validateTemplate(tpl)).toThrow(/exitStep/);
  });

  it("rejects a transition whose endpoint is unknown", () => {
    const tpl = template({
      transitions: [edge("a", "b"), edge("b", "ghost")],
    });
    expect(() => validateTemplate(tpl)).toThrow(/transition references unknown step/);
  });

  it("rejects a non-loop cycle (a → b → a)", () => {
    const tpl = template({
      transitions: [edge("a", "b"), edge("b", "a", false)],
    });
    expect(() => validateTemplate(tpl)).toThrow(/cycle/);
  });

  it("rejects a non-loop self-cycle (a → a)", () => {
    const tpl = template({
      transitions: [edge("a", "a"), edge("a", "b")],
    });
    expect(() => validateTemplate(tpl)).toThrow(/cycle/);
  });
});

describe("findStep", () => {
  it("returns the matching step", () => {
    const tpl = template();
    expect(findStep(tpl, asStepId("a")).name).toBe("a");
  });

  it("throws when the step is missing", () => {
    expect(() => findStep(template(), asStepId("ghost"))).toThrow(TemplateError);
  });
});

describe("StepDef", () => {
  it("accepts an `claude_code.invoke` step with no Skill reference", () => {
    const tpl = template({
      steps: [
        step("a", { kind: "claude_code.invoke" }),
        step("b", { kind: "human.gate" }),
      ],
    });
    expect(() => validateTemplate(tpl)).not.toThrow();
  });
});

describe("validateTemplate — non-trivial DAGs", () => {
  it("accepts a diamond DAG (a → b, a → c, b → d, c → d)", () => {
    const tpl = template({
      steps: [step("a"), step("b"), step("c"), step("d")],
      transitions: [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")],
      exitSteps: [asStepId("d")],
    });
    expect(() => validateTemplate(tpl)).not.toThrow();
  });

  it("accepts disconnected steps (no transitions touching them)", () => {
    const tpl = template({
      steps: [step("a"), step("b"), step("c")],
      transitions: [edge("a", "b")],
      exitSteps: [asStepId("b")],
    });
    expect(() => validateTemplate(tpl)).not.toThrow();
  });

  it("detects deep non-loop cycles (a → b → c → a)", () => {
    const tpl = template({
      steps: [step("a"), step("b"), step("c")],
      transitions: [edge("a", "b"), edge("b", "c"), edge("c", "a")],
      exitSteps: [asStepId("c")],
    });
    expect(() => validateTemplate(tpl)).toThrow(/cycle/);
  });
});

const variable = (name: string, kind: string = "Markdown"): TemplateVariable => ({
  name,
  kind: kind as TemplateVariable["kind"],
});

describe("validateTemplate — variable declarations", () => {
  it("accepts an empty variables array", () => {
    const tpl = template({ variables: [] });
    expect(() => validateTemplate(tpl)).not.toThrow();
  });

  it("accepts multiple variables with distinct names", () => {
    const tpl = template({
      variables: [variable("draft"), variable("ticket", "plugin:linear:Ticket@v1")],
    });
    expect(() => validateTemplate(tpl)).not.toThrow();
  });

  it("rejects two variables with the same name", () => {
    const tpl = template({
      variables: [variable("draft"), variable("draft")],
    });
    expect(() => validateTemplate(tpl)).toThrow(TemplateError);
    expect(() => validateTemplate(tpl)).toThrow(/duplicate.*draft/);
  });

  it("rejects a variable whose name starts with a digit", () => {
    const tpl = template({ variables: [variable("1var")] });
    expect(() => validateTemplate(tpl)).toThrow(TemplateError);
    expect(() => validateTemplate(tpl)).toThrow(/invalid name/);
  });

  it("rejects a variable whose name contains a hyphen", () => {
    const tpl = template({ variables: [variable("foo-bar")] });
    expect(() => validateTemplate(tpl)).toThrow(TemplateError);
    expect(() => validateTemplate(tpl)).toThrow(/invalid name/);
  });

  it("rejects a variable with an empty name", () => {
    const tpl = template({ variables: [variable("")] });
    expect(() => validateTemplate(tpl)).toThrow(TemplateError);
    expect(() => validateTemplate(tpl)).toThrow(/invalid name/);
  });

  it("accepts variable names with underscores and camelCase", () => {
    const tpl = template({
      variables: [
        variable("_private"),
        variable("camelCase"),
        variable("snake_case"),
        variable("X"),
      ],
    });
    expect(() => validateTemplate(tpl)).not.toThrow();
  });
});
