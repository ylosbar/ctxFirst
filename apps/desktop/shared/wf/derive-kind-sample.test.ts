import { describe, expect, it } from "vitest";

import { deriveKindSample } from "./derive-kind-sample";

describe("deriveKindSample", () => {
  it("emits format-aware string defaults", () => {
    expect(
      deriveKindSample({
        type: "object",
        properties: { value: { type: "string", format: "email" } },
        required: ["value"],
      }),
    ).toEqual({ value: "user@example.com" });

    expect(
      deriveKindSample({
        type: "object",
        properties: { value: { type: "string", format: "url" } },
        required: ["value"],
      }),
    ).toEqual({ value: "https://example.com" });
  });

  it("omits optional object properties", () => {
    expect(
      deriveKindSample({
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "number" },
        },
        required: ["a"],
      }),
    ).toEqual({ a: "" });
  });

  it("returns a single-element array for arrays", () => {
    expect(
      deriveKindSample({ type: "array", items: { type: "string" } }),
    ).toEqual([""]);
  });

  it("picks the first variant of `oneOf`", () => {
    expect(
      deriveKindSample({ oneOf: [{ const: "a" }, { const: "b" }] }),
    ).toBe("a");
  });

  it("returns scalar defaults", () => {
    expect(deriveKindSample({ type: "number" })).toBe(0);
    expect(deriveKindSample({ type: "boolean" })).toBe(false);
  });

  it("returns `null` for unknown / malformed nodes", () => {
    expect(deriveKindSample(null)).toBe(null);
    expect(deriveKindSample({ type: "weird" })).toBe(null);
  });
});
