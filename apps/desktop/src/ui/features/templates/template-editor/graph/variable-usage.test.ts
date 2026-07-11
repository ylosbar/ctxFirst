import { describe, expect, it } from "vitest";

import type { TemplateStepDraft } from "../../../../../domain/workflow/types";
import {
  collectUsedVariableNames,
  collectVariableReferences,
  isVariableUsed,
} from "./variable-usage";

const step = (
  id: string,
  extra: Partial<TemplateStepDraft> = {},
): TemplateStepDraft => ({
  id,
  name: id,
  kind: "user.input",
  actorRole: "LLMAgent",
  config: {},
  humanGateRequired: false,
  ...extra,
});

describe("collectVariableReferences", () => {
  it("reports producers (writesTo) and consumers (readsFrom)", () => {
    const steps = [
      step("a", { writesTo: { out: "ticket" } }),
      step("b", { readsFrom: { in: "ticket" } }),
      step("c", { readsFrom: { in: "other" } }),
    ];
    expect(collectVariableReferences(steps, "ticket")).toEqual({
      producers: ["a"],
      consumers: ["b"],
    });
  });

  it("lists a step at most once per side even with several matching ports", () => {
    const steps = [
      step("a", { readsFrom: { in1: "ticket", in2: "ticket" } }),
    ];
    const refs = collectVariableReferences(steps, "ticket");
    expect(refs.consumers).toEqual(["a"]);
    expect(refs.producers).toEqual([]);
  });

  it("counts a step that both writes and reads the variable in both lists", () => {
    const steps = [
      step("a", { writesTo: { out: "ticket" }, readsFrom: { in: "ticket" } }),
    ];
    expect(collectVariableReferences(steps, "ticket")).toEqual({
      producers: ["a"],
      consumers: ["a"],
    });
  });
});

describe("isVariableUsed", () => {
  it("is true when a step writes the variable", () => {
    expect(isVariableUsed([step("a", { writesTo: { out: "v" } })], "v")).toBe(
      true,
    );
  });

  it("is true when a step reads the variable", () => {
    expect(isVariableUsed([step("a", { readsFrom: { in: "v" } })], "v")).toBe(
      true,
    );
  });

  it("is false when no step references the variable", () => {
    expect(isVariableUsed([step("a", { writesTo: { out: "x" } })], "v")).toBe(
      false,
    );
  });

  it("is false for a variable only carrying declaration metadata (no wiring)", () => {
    // `defaultValue` / `role` / `promptAtLaunch` live on the declaration, not on
    // a step's writesTo/readsFrom — they do not count as usage.
    const steps = [step("a", { writesTo: { out: "other" } })];
    expect(isVariableUsed(steps, "unused")).toBe(false);
  });
});

describe("collectUsedVariableNames", () => {
  it("returns the union of writesTo and readsFrom across all steps", () => {
    const steps = [
      step("a", { writesTo: { out: "produced" } }),
      step("b", { readsFrom: { in: "consumed" } }),
      step("c", { writesTo: { out: "produced" }, readsFrom: { in: "shared" } }),
    ];
    expect(collectUsedVariableNames(steps)).toEqual(
      new Set(["produced", "consumed", "shared"]),
    );
  });

  it("is empty when no step wires any variable", () => {
    expect(collectUsedVariableNames([step("a"), step("b")]).size).toBe(0);
  });
});
