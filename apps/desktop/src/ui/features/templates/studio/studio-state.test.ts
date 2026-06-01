import { describe, expect, it } from "vitest";
import type { NodeSpecView } from "../../../../domain/workflow/types";
import {
  allRequiredFilled,
  seedFromSpec,
  toIpcInputs,
} from "./studio-state";
import {
  hasNativeSideEffects,
  isKindDegradedInStudio,
  isKindRunnableInStudio,
} from "./runnable-kinds";

const spec = (
  inputs: NodeSpecView["inputs"],
): Pick<NodeSpecView, "inputs"> => ({ inputs });

describe("seedFromSpec", () => {
  it("returns one draft per declared port with included=true for required, false for optional", () => {
    const inputs = seedFromSpec(
      spec([
        { name: "main", kinds: ["Markdown"] },
        { name: "extra", kinds: ["Markdown"], optional: true },
      ]),
    );
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({
      port: "main",
      kind: "Markdown",
      included: true,
    });
    expect(inputs[1]).toMatchObject({
      port: "extra",
      kind: "Markdown",
      included: false,
    });
  });

  it("picks the first kind for polymorphic ports", () => {
    const inputs = seedFromSpec(
      spec([{ name: "p", kinds: ["Markdown", "LinearRef"] }]),
    );
    expect(inputs[0]?.kind).toBe("Markdown");
  });

  it("falls back to Markdown for wildcard ports", () => {
    const inputs = seedFromSpec(spec([{ name: "p", kinds: ["*"] }]));
    expect(inputs[0]?.kind).toBe("Markdown");
  });
});

describe("allRequiredFilled", () => {
  it("returns true when every required port has non-empty content", () => {
    const s = spec([{ name: "main", kinds: ["Markdown"] }]);
    const inputs = [
      { port: "main", kind: "Markdown" as const, content: "hi", included: true },
    ];
    expect(allRequiredFilled(s, inputs)).toBe(true);
  });

  it("returns false when a required port is blank", () => {
    const s = spec([{ name: "main", kinds: ["Markdown"] }]);
    const inputs = [
      { port: "main", kind: "Markdown" as const, content: "  ", included: true },
    ];
    expect(allRequiredFilled(s, inputs)).toBe(false);
  });

  it("ignores optional ports left empty", () => {
    const s = spec([
      { name: "main", kinds: ["Markdown"] },
      { name: "extra", kinds: ["Markdown"], optional: true },
    ]);
    const inputs = [
      { port: "main", kind: "Markdown" as const, content: "x", included: true },
      {
        port: "extra",
        kind: "Markdown" as const,
        content: "",
        included: false,
      },
    ];
    expect(allRequiredFilled(s, inputs)).toBe(true);
  });
});

describe("toIpcInputs", () => {
  it("drops non-included entries", () => {
    const result = toIpcInputs([
      {
        port: "main",
        kind: "Markdown",
        content: "hi",
        included: true,
      },
      {
        port: "extra",
        kind: "Markdown",
        content: "",
        included: false,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ port: "main", kind: "Markdown", content: "hi" });
  });
});

describe("isKindRunnableInStudio", () => {
  it("rejects loop kinds and export-run", () => {
    expect(isKindRunnableInStudio("loop.foreach")).toBe(false);
    expect(isKindRunnableInStudio("loop.collect")).toBe(false);
    expect(isKindRunnableInStudio("export-run")).toBe(false);
  });

  it("accepts common kinds and plugin kinds by default", () => {
    expect(isKindRunnableInStudio("concat.markdown")).toBe(true);
    expect(isKindRunnableInStudio("user.input")).toBe(true);
    expect(isKindRunnableInStudio("plugin:foo:bar@1")).toBe(true);
  });
});

describe("isKindDegradedInStudio", () => {
  it("flags side-effect-only nodes whose outcome makes no sense isolated", () => {
    expect(isKindDegradedInStudio("workspace.set")).toBe(true);
    expect(isKindDegradedInStudio("human.gate")).toBe(true);
    expect(isKindDegradedInStudio("concat.markdown")).toBe(false);
  });
});

describe("hasNativeSideEffects", () => {
  it("flags kinds that touch shell / LLM / HTTP / fs", () => {
    expect(hasNativeSideEffects("shell.exec")).toBe(true);
    expect(hasNativeSideEffects("claude_code.invoke")).toBe(true);
    expect(hasNativeSideEffects("linear.fetch")).toBe(true);
    expect(hasNativeSideEffects("concat.markdown")).toBe(false);
    expect(hasNativeSideEffects("user.input")).toBe(false);
  });
});
