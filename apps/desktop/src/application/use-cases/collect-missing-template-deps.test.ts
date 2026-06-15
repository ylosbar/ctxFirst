import { describe, expect, it } from "vitest";

import { collectTemplateDeps } from "./collect-missing-template-deps";
import type {
  TemplateDraft,
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../domain/workflow/types";

const step = (
  over: Partial<TemplateStepDraft> & { id: string },
): TemplateStepDraft => ({
  name: over.id,
  kind: "claude_code.invoke",
  actorRole: "LLMAgent",
  config: {},
  humanGateRequired: false,
  ...over,
});

const tpl = (over: Partial<TemplateDraft>): TemplateDraft => ({
  id: "t",
  version: "1.0.0",
  name: "T",
  description: "",
  entryStep: "",
  exitSteps: [],
  steps: [],
  transitions: [],
  variables: [],
  status: "draft",
  ...over,
});

const empty = {
  skillRefs: new Set<string>(),
  artifactKinds: new Set<string>(),
  subTemplates: new Set<string>(),
};

describe("collectTemplateDeps", () => {
  it("collects skill refs from step configs and flags resolution", () => {
    const template = tpl({
      steps: [
        step({ id: "s1", config: { skillRef: "impl-from-spec" } }),
        step({ id: "s2", config: { skillRef: "review" } }),
      ],
    });
    const deps = collectTemplateDeps(template, {
      ...empty,
      skillRefs: new Set(["impl-from-spec"]),
    });
    expect(deps.skillRefs).toEqual([
      { ref: "impl-from-spec", usedBySteps: ["s1"], resolved: true },
      { ref: "review", usedBySteps: ["s2"], resolved: false },
    ]);
  });

  it("treats builtin kinds as resolved without a catalog entry", () => {
    const template = tpl({
      steps: [step({ id: "s1", config: { outputKind: "Markdown" } })],
    });
    const deps = collectTemplateDeps(template, empty);
    expect(deps.artifactKinds).toEqual([
      { ref: "Markdown", usedBySteps: ["s1"], resolved: true },
    ]);
  });

  it("resolves dynamic kinds against the available catalog", () => {
    const template = tpl({
      steps: [
        step({ id: "s1", config: { outputKind: "user:foo@1.0.0" } }),
        step({ id: "s2", config: { inputKind: "user:bar@1.0.0" } }),
      ],
    });
    const deps = collectTemplateDeps(template, {
      ...empty,
      artifactKinds: new Set(["user:foo@1.0.0"]),
    });
    expect(deps.artifactKinds).toEqual([
      { ref: "user:bar@1.0.0", usedBySteps: ["s2"], resolved: false },
      { ref: "user:foo@1.0.0", usedBySteps: ["s1"], resolved: true },
    ]);
  });

  it("collects sub-template refs from workflow.call steps", () => {
    const template = tpl({
      steps: [
        step({
          id: "s1",
          kind: "workflow.call",
          config: { templateId: "sub", templateVersion: "2.0.0" },
        }),
      ],
    });
    const deps = collectTemplateDeps(template, {
      ...empty,
      subTemplates: new Set(["sub@2.0.0"]),
    });
    expect(deps.subTemplates).toEqual([
      { ref: "sub@2.0.0", usedBySteps: ["s1"], resolved: true },
    ]);
  });

  it("lists declared variable kinds even when unbound, and attributes bound ones to their step", () => {
    const variables: TemplateVariableDraft[] = [
      { name: "spec", kind: "user:bar@1.0.0", role: "output" },
      { name: "lonely", kind: "user:unused@1.0.0", role: "internal" },
    ];
    const template = tpl({
      variables,
      steps: [step({ id: "s1", writesTo: { out: "spec" } })],
    });
    const deps = collectTemplateDeps(template, empty);
    expect(deps.artifactKinds).toEqual([
      { ref: "user:bar@1.0.0", usedBySteps: ["s1"], resolved: false },
      { ref: "user:unused@1.0.0", usedBySteps: [], resolved: false },
    ]);
  });

  it("aggregates and sorts the steps that use a ref", () => {
    const template = tpl({
      steps: [
        step({ id: "s2", config: { skillRef: "shared" } }),
        step({ id: "s1", config: { skillRef: "shared" } }),
      ],
    });
    const deps = collectTemplateDeps(template, empty);
    expect(deps.skillRefs).toEqual([
      { ref: "shared", usedBySteps: ["s1", "s2"], resolved: false },
    ]);
  });
});
