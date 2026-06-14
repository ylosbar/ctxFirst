import { describe, expect, it } from "vitest";

import { collectLaunchInputs } from "./collect-launch-inputs";
import type {
  TemplateDraft,
  TemplateVariableDraft,
} from "../../domain/workflow/types";

const tpl = (variables: TemplateVariableDraft[]): TemplateDraft => ({
  id: "t",
  version: "1.0.0",
  name: "T",
  description: "",
  entryStep: "",
  exitSteps: [],
  steps: [],
  transitions: [],
  variables,
  status: "draft",
});

describe("collectLaunchInputs", () => {
  it("keeps only variables flagged promptAtLaunch", () => {
    const inputs = collectLaunchInputs(
      tpl([
        { name: "endpoint", kind: "Markdown", promptAtLaunch: true },
        { name: "internalDraft", kind: "Markdown" },
        { name: "ticketId", kind: "Markdown", promptAtLaunch: true, defaultValue: "ABC-1" },
      ]),
    );
    expect(inputs.map((i) => i.name)).toEqual(["endpoint", "ticketId"]);
  });

  it("marks a launch input without a defaultValue as required, with one as not required (pre-filled)", () => {
    const inputs = collectLaunchInputs(
      tpl([
        { name: "endpoint", kind: "Markdown", promptAtLaunch: true },
        { name: "ticketId", kind: "Markdown", promptAtLaunch: true, defaultValue: "ABC-1" },
      ]),
    );
    expect(inputs).toEqual([
      { name: "endpoint", kind: "Markdown", required: true },
      { name: "ticketId", kind: "Markdown", defaultValue: "ABC-1", required: false },
    ]);
  });

  it("carries the description when present", () => {
    const inputs = collectLaunchInputs(
      tpl([
        { name: "endpoint", kind: "Json", description: "API base URL", promptAtLaunch: true },
      ]),
    );
    expect(inputs[0]).toEqual({
      name: "endpoint",
      kind: "Json",
      description: "API base URL",
      required: true,
    });
  });

  it("preserves declaration order (stable form)", () => {
    const inputs = collectLaunchInputs(
      tpl([
        { name: "zeta", kind: "Markdown", promptAtLaunch: true },
        { name: "alpha", kind: "Markdown", promptAtLaunch: true },
      ]),
    );
    expect(inputs.map((i) => i.name)).toEqual(["zeta", "alpha"]);
  });

  it("returns an empty list when no variable opts in", () => {
    expect(collectLaunchInputs(tpl([{ name: "x", kind: "Markdown" }]))).toEqual([]);
  });
});
