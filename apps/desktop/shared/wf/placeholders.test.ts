import { describe, expect, it } from "vitest";
import { extractPlaceholders, renderTemplate } from "./placeholders";

describe("extractPlaceholders", () => {
  it("returns referenced names in first-appearance order, deduplicated", () => {
    expect(extractPlaceholders("{{a}} x {{ b }} {{a}}")).toEqual(["a", "b"]);
  });

  it("tolerates whitespace inside the braces", () => {
    expect(extractPlaceholders("{{ spec }} {{patch }}")).toEqual([
      "spec",
      "patch",
    ]);
  });

  it("ignores names that don't match the grammar", () => {
    expect(extractPlaceholders("{{1x}} {{a-b}} {{ }} {{good}}")).toEqual([
      "good",
    ]);
  });

  it("returns an empty list when nothing is referenced", () => {
    expect(extractPlaceholders("nothing here")).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("substitutes a single placeholder", () => {
    const out = renderTemplate(
      "A {{spec}} B",
      new Map([["spec", "S"]]),
      { onMissing: "keep" },
    );
    expect(out.output).toBe("A S B");
    expect(out.missing).toEqual([]);
    expect(out.unused).toEqual([]);
  });

  it("substitutes multiple occurrences of the same placeholder", () => {
    const out = renderTemplate(
      "{{x}}-{{x}}-{{x}}",
      new Map([["x", "1"]]),
      { onMissing: "keep" },
    );
    expect(out.output).toBe("1-1-1");
  });

  it("keeps missing placeholders literal under onMissing=keep", () => {
    const out = renderTemplate(
      "{{a}} {{b}}",
      new Map([["a", "A"]]),
      { onMissing: "keep" },
    );
    expect(out.output).toBe("A {{b}}");
    expect(out.missing).toEqual(["b"]);
  });

  it("empties missing placeholders under onMissing=empty", () => {
    const out = renderTemplate(
      "[{{a}}][{{b}}]",
      new Map([["a", "A"]]),
      { onMissing: "empty" },
    );
    expect(out.output).toBe("[A][]");
    expect(out.missing).toEqual(["b"]);
  });

  it("throws under onMissing=error listing the missing names", () => {
    expect(() =>
      renderTemplate(
        "{{a}} {{b}}",
        new Map([["a", "A"]]),
        { onMissing: "error" },
      ),
    ).toThrow(/\{\{b\}\}/);
  });

  it("reports unused values", () => {
    const out = renderTemplate(
      "only {{a}}",
      new Map([
        ["a", "A"],
        ["dangling", "X"],
      ]),
      { onMissing: "keep" },
    );
    expect(out.unused).toEqual(["dangling"]);
  });

  it("tolerates whitespace inside the braces during substitution", () => {
    const out = renderTemplate(
      "A {{ spec }} B",
      new Map([["spec", "S"]]),
      { onMissing: "keep" },
    );
    expect(out.output).toBe("A S B");
  });
});
