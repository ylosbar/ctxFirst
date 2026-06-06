import { describe, expect, it } from "vitest";

import {
  encodeOneOf,
  readBranchMatchVariants,
  splitTopLevel,
} from "./branch-match-grammar";

describe("branch-match-grammar", () => {
  describe("readBranchMatchVariants", () => {
    it("falls back to two empty slots when the field is missing or empty", () => {
      expect(readBranchMatchVariants(undefined)).toEqual(["", ""]);
      expect(readBranchMatchVariants("")).toEqual(["", ""]);
      expect(readBranchMatchVariants(42)).toEqual(["", ""]);
    });

    it("parses a valid OneOf<…> into its variants", () => {
      expect(readBranchMatchVariants("OneOf<Markdown,Json>")).toEqual([
        "Markdown",
        "Json",
      ]);
    });

    it("returns two empty slots for a non-sum kind", () => {
      expect(readBranchMatchVariants("Markdown")).toEqual(["", ""]);
    });
  });

  describe("splitTopLevel", () => {
    it("splits at top-level commas only, respecting nested chevrons", () => {
      expect(splitTopLevel("A,B,C")).toEqual(["A", "B", "C"]);
      expect(splitTopLevel("List<A,B>,C")).toEqual(["List<A,B>", "C"]);
    });

    it("pads to a minimum of two parts", () => {
      expect(splitTopLevel("A")).toEqual(["A", ""]);
      expect(splitTopLevel("")).toEqual(["", ""]);
    });
  });

  describe("encodeOneOf", () => {
    it("joins variants into the canonical OneOf<…> string", () => {
      expect(encodeOneOf(["Markdown", "Json"])).toBe("OneOf<Markdown,Json>");
      expect(encodeOneOf(["A", "", "C"])).toBe("OneOf<A,,C>");
    });
  });
});
