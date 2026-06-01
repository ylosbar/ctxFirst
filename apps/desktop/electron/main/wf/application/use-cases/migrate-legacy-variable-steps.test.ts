import { describe, expect, it } from "vitest";
import { migrateLegacyVariableSteps } from "./migrate-legacy-variable-steps";
import { buildTemplate } from "../../__tests__/fixtures/builders";

describe("migrateLegacyVariableSteps", () => {
  it("is a no-op for modern templates without variable.set/get", () => {
    const tpl = buildTemplate(
      "modern",
      [
        { id: "a", kind: "user.input", humanGateRequired: false },
        { id: "b", kind: "human.gate", humanGateRequired: true },
      ],
      [{ from: "a", to: "b" }],
      { id: "modern", version: "v1" },
    );
    const result = migrateLegacyVariableSteps(tpl);
    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual([]);
    expect(result.template).toBe(tpl);
  });

  it("rewrites variable.set into producer.writesTo and re-points outgoing edges", () => {
    const tpl = buildTemplate(
      "legacy",
      [
        { id: "producer", kind: "user.input", humanGateRequired: false },
        {
          id: "setter",
          kind: "variable.set",
          humanGateRequired: false,
          config: { variableName: "spec" },
        },
        { id: "downstream", kind: "human.gate", humanGateRequired: true },
      ],
      [
        { from: "producer", to: "setter" },
        { from: "setter", to: "downstream" },
      ],
      { id: "legacy", version: "v1" },
    );
    const result = migrateLegacyVariableSteps(tpl);
    expect(result.changed).toBe(true);
    expect(result.template.steps.find((s) => s.id === "setter")).toBeUndefined();
    const producer = result.template.steps.find((s) => s.id === "producer")!;
    expect(producer.writesTo).toEqual({ out: "spec" });
    expect(
      result.template.transitions.some(
        (t) => t.from === "producer" && t.to === "downstream",
      ),
    ).toBe(true);
  });

  it("rewrites variable.get into consumer.readsFrom", () => {
    const tpl = buildTemplate(
      "legacy-get",
      [
        { id: "upstream", kind: "user.input", humanGateRequired: false },
        {
          id: "getter",
          kind: "variable.get",
          humanGateRequired: false,
          config: { variableName: "spec" },
        },
        { id: "consumer", kind: "human.gate", humanGateRequired: true },
      ],
      [
        { from: "upstream", to: "getter" },
        { from: "getter", to: "consumer" },
      ],
      { id: "legacy-get", version: "v1" },
    );
    const result = migrateLegacyVariableSteps(tpl);
    expect(result.changed).toBe(true);
    expect(result.template.steps.find((s) => s.id === "getter")).toBeUndefined();
    const consumer = result.template.steps.find((s) => s.id === "consumer")!;
    expect(consumer.readsFrom).toEqual({ input: "spec" });
  });

  it("reports skipped variable.set when variableName is missing", () => {
    const tpl = buildTemplate(
      "bad",
      [
        { id: "producer", kind: "user.input", humanGateRequired: false },
        {
          id: "setter",
          kind: "variable.set",
          humanGateRequired: false,
          config: {},
        },
        { id: "consumer", kind: "human.gate", humanGateRequired: true },
      ],
      [
        { from: "producer", to: "setter" },
        { from: "setter", to: "consumer" },
      ],
      { id: "bad", version: "v1" },
    );
    const result = migrateLegacyVariableSteps(tpl);
    expect(result.changed).toBe(true);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("missing-variable-name");
    expect(result.template.steps.some((s) => s.id === "setter")).toBe(true);
  });

  it("reports skipped variable.set when there is no incoming non-loop transition", () => {
    const tpl = buildTemplate(
      "orphan",
      [
        {
          id: "setter",
          kind: "variable.set",
          humanGateRequired: false,
          config: { variableName: "spec" },
        },
        { id: "consumer", kind: "human.gate", humanGateRequired: true },
      ],
      [{ from: "setter", to: "consumer" }],
      { id: "orphan", version: "v1" },
    );
    const result = migrateLegacyVariableSteps(tpl);
    expect(
      result.skipped.find((s) => s.reason === "no-incoming-transition"),
    ).toBeDefined();
  });

  it("is idempotent — a second pass over a migrated template is a no-op", () => {
    const tpl = buildTemplate(
      "idem",
      [
        { id: "producer", kind: "user.input", humanGateRequired: false },
        {
          id: "setter",
          kind: "variable.set",
          humanGateRequired: false,
          config: { variableName: "v" },
        },
        { id: "consumer", kind: "human.gate", humanGateRequired: true },
      ],
      [
        { from: "producer", to: "setter" },
        { from: "setter", to: "consumer" },
      ],
      { id: "idem", version: "v1" },
    );
    const first = migrateLegacyVariableSteps(tpl);
    const second = migrateLegacyVariableSteps(first.template);
    expect(second.changed).toBe(false);
    expect(second.skipped).toEqual([]);
  });
});
