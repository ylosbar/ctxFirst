import { describe, expect, it } from "vitest";

import { collectSkillConsumers } from "./collect-skill-consumers";
import type { TemplateStepView, TemplateView } from "../../domain/workflow/types";

const step = (
  over: Partial<TemplateStepView> & { id: string },
): TemplateStepView => ({
  name: over.id,
  kind: "skill.loader",
  actorRole: "LLMAgent",
  config: {},
  humanGateRequired: false,
  ...over,
});

const tpl = (over: Partial<TemplateView> & { id: string }): TemplateView => ({
  version: "1.0.0",
  name: over.id,
  description: "",
  entryStep: "",
  exitSteps: [],
  steps: [],
  transitions: [],
  variables: [],
  status: "published",
  ...over,
});

describe("collectSkillConsumers", () => {
  it("returns [] when there are no templates", () => {
    expect(collectSkillConsumers("S", [])).toEqual([]);
  });

  it("matches a skill.loader step and reports its provenance", () => {
    const consumers = collectSkillConsumers("S", [
      tpl({
        id: "flow",
        steps: [
          step({ id: "s1", name: "Implement", config: { skillRef: "S" } }),
        ],
      }),
    ]);
    expect(consumers).toEqual([
      {
        templateRef: "flow@1.0.0",
        templateName: "flow",
        status: "published",
        usedBySteps: [{ id: "s1", name: "Implement" }],
      },
    ]);
  });

  it("matches kind-agnostically (openrouter.invoke, not only skill.loader)", () => {
    const consumers = collectSkillConsumers("S", [
      tpl({
        id: "flow",
        steps: [
          step({
            id: "s1",
            kind: "openrouter.invoke",
            config: { skillRef: "S" },
          }),
        ],
      }),
    ]);
    expect(consumers).toHaveLength(1);
    expect(consumers[0]?.usedBySteps).toEqual([{ id: "s1", name: "s1" }]);
  });

  it("lists a template once with N steps when a skill is used more than once", () => {
    const consumers = collectSkillConsumers("S", [
      tpl({
        id: "flow",
        steps: [
          step({ id: "s1", name: "First", config: { skillRef: "S" } }),
          step({ id: "s2", name: "Second", config: { skillRef: "S" } }),
          step({ id: "s3", name: "Other", config: { skillRef: "T" } }),
        ],
      }),
    ]);
    expect(consumers).toHaveLength(1);
    expect(consumers[0]?.usedBySteps).toEqual([
      { id: "s1", name: "First" },
      { id: "s2", name: "Second" },
    ]);
  });

  it("does not match a step pointing at a different ref", () => {
    const consumers = collectSkillConsumers("S", [
      tpl({ id: "flow", steps: [step({ id: "s1", config: { skillRef: "T" } })] }),
    ]);
    expect(consumers).toEqual([]);
  });

  it("returns [] for an empty skillRef", () => {
    const consumers = collectSkillConsumers("", [
      tpl({ id: "flow", steps: [step({ id: "s1", config: { skillRef: "" } })] }),
    ]);
    expect(consumers).toEqual([]);
  });

  it("treats two versions of the same id as distinct entries", () => {
    const consumers = collectSkillConsumers("S", [
      tpl({
        id: "flow",
        version: "1.0.0",
        name: "flow",
        steps: [step({ id: "s1", config: { skillRef: "S" } })],
      }),
      tpl({
        id: "flow",
        version: "2.0.0",
        name: "flow",
        steps: [step({ id: "s1", config: { skillRef: "S" } })],
      }),
    ]);
    expect(consumers.map((c) => c.templateRef)).toEqual([
      "flow@1.0.0",
      "flow@2.0.0",
    ]);
  });

  it("sorts by templateName and falls back to templateRef when name is empty", () => {
    const consumers = collectSkillConsumers("S", [
      tpl({
        id: "zeta",
        name: "Zeta",
        steps: [step({ id: "s1", config: { skillRef: "S" } })],
      }),
      tpl({
        id: "unnamed",
        name: "",
        steps: [step({ id: "s1", config: { skillRef: "S" } })],
      }),
      tpl({
        id: "alpha",
        name: "Alpha",
        steps: [step({ id: "s1", config: { skillRef: "S" } })],
      }),
    ]);
    expect(consumers.map((c) => c.templateName)).toEqual([
      "Alpha",
      "unnamed@1.0.0",
      "Zeta",
    ]);
  });
});
