import { describe, expect, it } from "vitest";

import {
  highestCounterForKind,
  isSyntheticId,
  makeStepId,
} from "./ids";

describe("ids", () => {
  describe("makeStepId", () => {
    it("replaces dots in the kind with dashes and appends the counter", () => {
      expect(makeStepId("llm.judge", 3)).toBe("llm-judge-3");
      expect(makeStepId("format.validate", 1)).toBe("format-validate-1");
    });
  });

  describe("highestCounterForKind", () => {
    it("returns the max counter among ids matching the kind prefix", () => {
      const ids = ["llm-judge-1", "llm-judge-4", "llm-judge-2", "format-validate-9"];
      expect(highestCounterForKind("llm.judge", ids)).toBe(4);
    });

    it("returns 0 when no id matches the kind", () => {
      expect(highestCounterForKind("llm.judge", ["format-validate-2"])).toBe(0);
      expect(highestCounterForKind("llm.judge", [])).toBe(0);
    });

    it("ignores ids whose suffix is not an integer", () => {
      expect(highestCounterForKind("llm.judge", ["llm-judge-x", "llm-judge-2"])).toBe(2);
    });
  });

  describe("isSyntheticId", () => {
    it("flags start, start-edge, variable node and variable edge ids", () => {
      expect(isSyntheticId("__start__")).toBe(true);
      expect(isSyntheticId("__start-edge__")).toBe(true);
      expect(isSyntheticId("__var-foo")).toBe(true);
      expect(isSyntheticId("__var-edge-foo")).toBe(true);
    });

    it("does not flag real step / group / sticky ids", () => {
      expect(isSyntheticId("llm-judge-1")).toBe(false);
      expect(isSyntheticId("grp-1")).toBe(false);
      expect(isSyntheticId("note-1")).toBe(false);
    });
  });
});
