import { describe, expect, it } from "vitest";

import { categoryFromPath } from "./categories";

describe("categoryFromPath", () => {
  it("returns null on the bare settings root", () => {
    expect(categoryFromPath("/settings")).toBeNull();
    expect(categoryFromPath("/settings/")).toBeNull();
  });

  it("returns null for a non-settings route", () => {
    expect(categoryFromPath("/templates")).toBeNull();
    expect(categoryFromPath("/")).toBeNull();
  });

  it("extracts the first segment after the prefix", () => {
    expect(categoryFromPath("/settings/llm")).toBe("llm");
    expect(categoryFromPath("/settings/llm/extra")).toBe("llm");
  });

  it("decodes the segment", () => {
    expect(categoryFromPath("/settings/my%20plugin")).toBe("my plugin");
  });
});
