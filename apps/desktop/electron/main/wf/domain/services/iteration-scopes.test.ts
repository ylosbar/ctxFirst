import { describe, expect, it } from "vitest";
import {
  asStepId,
  asTemplateId,
  asTemplateVersion,
} from "../ids";
import type { WorkflowTemplate } from "../template";
import {
  buildIterationKey,
  inferIterationScopes,
  isSequentialForeach,
  IterationScopeError,
  type IterationScopeErrorCode,
  iterationKeyMatches,
  parseIterationIndex,
} from "./iteration-scopes";
import type { StepDef } from "../template";

const expectThrowsWithCode = (
  fn: () => unknown,
  code: IterationScopeErrorCode,
): void => {
  try {
    fn();
    throw new Error("expected throw");
  } catch (err) {
    if (!(err instanceof IterationScopeError)) {
      throw new Error(
        `expected IterationScopeError, got ${err instanceof Error ? err.constructor.name : typeof err}: ${String(err)}`,
      );
    }
    if (err.code !== code) {
      throw new Error(`expected code "${code}", got "${err.code}"`);
    }
  }
};

const stepId = asStepId;

const baseTemplate = (
  overrides: Partial<WorkflowTemplate> = {},
): WorkflowTemplate => ({
  id: asTemplateId("tpl-test"),
  name: "test",
  description: "test",
  version: asTemplateVersion("v1"),
  entryStep: stepId("entry"),
  exitSteps: [stepId("exit")],
  steps: [],
  transitions: [],
  variables: [],
  status: "draft",
  ...overrides,
});

const step = (id: string, kind: string) => ({
  id: stepId(id),
  name: id,
  kind,
  actorRole: "Developer" as const,
  config: {},
  humanGateRequired: false,
});

describe("inferIterationScopes — happy paths", () => {
  it("empty template yields empty maps", () => {
    const r = inferIterationScopes(baseTemplate());
    expect(r.scopeByStep.size).toBe(0);
    expect(r.collectOf.size).toBe(0);
  });

  it("pairs a single foreach with its single collect and tags the body", () => {
    const tpl = baseTemplate({
      entryStep: stepId("foreach"),
      exitSteps: [stepId("collect")],
      steps: [
        step("foreach", "loop.foreach"),
        step("body", "claude_code.invoke"),
        step("collect", "loop.collect"),
      ],
      transitions: [
        { from: stepId("foreach"), to: stepId("body"), isLoop: false },
        { from: stepId("body"), to: stepId("collect"), isLoop: false },
      ],
    });
    const r = inferIterationScopes(tpl);
    expect(r.collectOf.get(stepId("foreach"))).toBe(stepId("collect"));
    expect(r.foreachOf.get(stepId("collect"))).toBe(stepId("foreach"));
    expect(r.scopeByStep.get(stepId("body"))).toBe(stepId("foreach"));
    expect(r.scopeByStep.has(stepId("foreach"))).toBe(false);
    expect(r.scopeByStep.has(stepId("collect"))).toBe(false);
  });

  it("tags every transition along the scope path", () => {
    const tpl = baseTemplate({
      entryStep: stepId("foreach"),
      exitSteps: [stepId("collect")],
      steps: [
        step("foreach", "loop.foreach"),
        step("a", "claude_code.invoke"),
        step("b", "human.gate"),
        step("collect", "loop.collect"),
      ],
      transitions: [
        { from: stepId("foreach"), to: stepId("a"), isLoop: false },
        { from: stepId("a"), to: stepId("b"), isLoop: false },
        { from: stepId("b"), to: stepId("collect"), isLoop: false },
      ],
    });
    const r = inferIterationScopes(tpl);
    expect(r.scopeByTransitionIndex.get(0)).toBe(stepId("foreach"));
    expect(r.scopeByTransitionIndex.get(1)).toBe(stepId("foreach"));
    expect(r.scopeByTransitionIndex.get(2)).toBe(stepId("foreach"));
  });

  it("accepts a feedback edge that stays inside the scope", () => {
    const tpl = baseTemplate({
      entryStep: stepId("foreach"),
      exitSteps: [stepId("collect")],
      steps: [
        step("foreach", "loop.foreach"),
        step("llm", "claude_code.invoke"),
        step("gate", "human.gate"),
        step("collect", "loop.collect"),
      ],
      transitions: [
        { from: stepId("foreach"), to: stepId("llm"), isLoop: false },
        { from: stepId("llm"), to: stepId("gate"), isLoop: false },
        { from: stepId("gate"), to: stepId("collect"), isLoop: false },
        { from: stepId("gate"), to: stepId("llm"), isLoop: true },
      ],
    });
    const r = inferIterationScopes(tpl);
    expect(r.scopeByTransitionIndex.get(3)).toBe(stepId("foreach"));
  });
});

describe("inferIterationScopes — invariants", () => {
  it("rejects an unmatched foreach", () => {
    const tpl = baseTemplate({
      entryStep: stepId("foreach"),
      exitSteps: [stepId("body")],
      steps: [
        step("foreach", "loop.foreach"),
        step("body", "claude_code.invoke"),
      ],
      transitions: [
        { from: stepId("foreach"), to: stepId("body"), isLoop: false },
      ],
    });
    expectThrowsWithCode(() => inferIterationScopes(tpl), "loop-unmatched");
  });

  it("rejects an unmatched collect", () => {
    const tpl = baseTemplate({
      entryStep: stepId("a"),
      exitSteps: [stepId("collect")],
      steps: [step("a", "claude_code.invoke"), step("collect", "loop.collect")],
      transitions: [
        { from: stepId("a"), to: stepId("collect"), isLoop: false },
      ],
    });
    expectThrowsWithCode(() => inferIterationScopes(tpl), "loop-unmatched");
  });

  it("rejects nested foreaches", () => {
    const tpl = baseTemplate({
      entryStep: stepId("outer"),
      exitSteps: [stepId("collect")],
      steps: [
        step("outer", "loop.foreach"),
        step("inner", "loop.foreach"),
        step("inner-collect", "loop.collect"),
        step("collect", "loop.collect"),
      ],
      transitions: [
        { from: stepId("outer"), to: stepId("inner"), isLoop: false },
        { from: stepId("inner"), to: stepId("inner-collect"), isLoop: false },
        { from: stepId("inner-collect"), to: stepId("collect"), isLoop: false },
      ],
    });
    expectThrowsWithCode(() => inferIterationScopes(tpl), "loop-nested");
  });

  it("rejects a feedback edge crossing the boundary", () => {
    const tpl = baseTemplate({
      entryStep: stepId("outside"),
      exitSteps: [stepId("collect")],
      steps: [
        step("outside", "claude_code.invoke"),
        step("foreach", "loop.foreach"),
        step("body", "claude_code.invoke"),
        step("collect", "loop.collect"),
      ],
      transitions: [
        { from: stepId("outside"), to: stepId("foreach"), isLoop: false },
        { from: stepId("foreach"), to: stepId("body"), isLoop: false },
        { from: stepId("body"), to: stepId("collect"), isLoop: false },
        // Cross-boundary loop: body (in-scope) → outside.
        { from: stepId("body"), to: stepId("outside"), isLoop: true },
      ],
    });
    expectThrowsWithCode(() => inferIterationScopes(tpl), "loop-feedback-cross");
  });
});

describe("iterationKeyMatches", () => {
  it("both undefined → true", () => {
    expect(iterationKeyMatches(undefined, undefined)).toBe(true);
  });
  it("producer in scope, consumer outside → false (would leak items)", () => {
    expect(iterationKeyMatches("step:0", undefined)).toBe(false);
  });
  it("producer outside, consumer in scope → true (broadcast)", () => {
    expect(iterationKeyMatches(undefined, "step:0")).toBe(true);
  });
  it("same key → true", () => {
    expect(iterationKeyMatches("a:1", "a:1")).toBe(true);
  });
  it("different keys → false", () => {
    expect(iterationKeyMatches("a:0", "a:1")).toBe(false);
  });
});

describe("buildIterationKey", () => {
  it("formats as `${loopStepId}:${index}`", () => {
    expect(buildIterationKey(stepId("foreach-1"), 2)).toBe("foreach-1:2");
  });
});

describe("parseIterationIndex", () => {
  it("is the inverse of buildIterationKey (round-trip)", () => {
    for (const id of ["fe", "foreach-1", "a:b"]) {
      for (const i of [0, 1, 7, 42]) {
        expect(parseIterationIndex(buildIterationKey(stepId(id), i))).toBe(i);
      }
    }
  });
  it("splits on the last `:` so a colon in the step id is tolerated", () => {
    expect(parseIterationIndex("scope:nested:3")).toBe(3);
  });
});

describe("isSequentialForeach", () => {
  const foreach = (config: Record<string, unknown>): StepDef => ({
    ...step("fe", "loop.foreach"),
    config,
  });

  it("is false when the flag is absent (fan-out default)", () => {
    expect(isSequentialForeach(foreach({ itemKind: "Markdown" }))).toBe(false);
  });
  it("is true only when `sequential === true`", () => {
    expect(isSequentialForeach(foreach({ sequential: true }))).toBe(true);
    expect(isSequentialForeach(foreach({ sequential: false }))).toBe(false);
  });
});
