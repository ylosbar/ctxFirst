import { describe, expect, it } from "vitest";
import { parseTemplateRef } from "./ids";

describe("parseTemplateRef", () => {
  it("splits a well-formed `id@version` ref", () => {
    expect(parseTemplateRef("transcriptor@v1")).toEqual({
      id: "transcriptor",
      version: "v1",
    });
  });

  it("rejects a ref with extra '@' segments instead of silently truncating", () => {
    // Regression: `"transcriptor@v1@v1"` used to split to (transcriptor, v1) —
    // the wrong pair — leaving the row un-openable and un-deletable.
    expect(() => parseTemplateRef("transcriptor@v1@v1")).toThrow(
      /invalid template ref/,
    );
  });

  it("rejects a ref with no version", () => {
    expect(() => parseTemplateRef("no-version")).toThrow(/invalid template ref/);
  });

  it("rejects a ref with an empty id", () => {
    expect(() => parseTemplateRef("@v1")).toThrow(/invalid template ref/);
  });

  it("rejects a ref with an empty version", () => {
    expect(() => parseTemplateRef("id@")).toThrow(/invalid template ref/);
  });
});
