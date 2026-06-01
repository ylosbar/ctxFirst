import { describe, expect, it } from "vitest";
import {
  instanceIdFromRunUri,
  parseRunUri,
  runUriFor,
} from "./run-uri";

describe("run-uri", () => {
  describe("runUriFor", () => {
    it("builds a bare run URI when no step is provided", () => {
      expect(runUriFor("wf_abc")).toBe("run://wf_abc");
    });

    it("appends ?step= when a step id is provided", () => {
      expect(runUriFor("wf_abc", { step: "spec" })).toBe(
        "run://wf_abc?step=spec",
      );
    });

    it("URL-encodes step ids with special characters", () => {
      expect(runUriFor("wf_abc", { step: "foo/bar" })).toBe(
        "run://wf_abc?step=foo%2Fbar",
      );
    });
  });

  describe("parseRunUri", () => {
    it("parses a bare run URI", () => {
      expect(parseRunUri("run://wf_abc")).toEqual({
        instanceId: "wf_abc",
        step: null,
      });
    });

    it("parses a run URI with a step", () => {
      expect(parseRunUri("run://wf_abc?step=spec")).toEqual({
        instanceId: "wf_abc",
        step: "spec",
      });
    });

    it("decodes step ids with special characters", () => {
      expect(parseRunUri("run://wf_abc?step=foo%2Fbar")).toEqual({
        instanceId: "wf_abc",
        step: "foo/bar",
      });
    });

    it("returns null for a non-run URI", () => {
      expect(parseRunUri("skill://foo")).toBeNull();
      expect(parseRunUri("")).toBeNull();
    });

    it("returns null when the instance id is missing", () => {
      expect(parseRunUri("run://")).toBeNull();
      expect(parseRunUri("run://?step=spec")).toBeNull();
    });

    it("round-trips through runUriFor", () => {
      const uri = runUriFor("wf_xyz", { step: "my-step" });
      expect(parseRunUri(uri)).toEqual({
        instanceId: "wf_xyz",
        step: "my-step",
      });
    });
  });

  describe("instanceIdFromRunUri", () => {
    it("returns the id for a bare URI", () => {
      expect(instanceIdFromRunUri("run://wf_abc")).toBe("wf_abc");
    });

    it("returns the id when a step is present (backwards-compat)", () => {
      expect(instanceIdFromRunUri("run://wf_abc?step=spec")).toBe("wf_abc");
    });

    it("returns null for invalid URIs", () => {
      expect(instanceIdFromRunUri("skill://foo")).toBeNull();
      expect(instanceIdFromRunUri("run://")).toBeNull();
    });
  });
});
