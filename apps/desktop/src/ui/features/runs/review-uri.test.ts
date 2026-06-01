import { describe, expect, it } from "vitest";
import { parseReviewUri, reviewUriFor } from "./review-uri";

describe("review-uri", () => {
  describe("reviewUriFor", () => {
    it("builds a review URI from instance + step exec ids", () => {
      expect(reviewUriFor("wf_abc", "exec_1")).toBe(
        "review://wf_abc?exec=exec_1",
      );
    });

    it("URL-encodes exec ids with special characters", () => {
      expect(reviewUriFor("wf_abc", "foo/bar")).toBe(
        "review://wf_abc?exec=foo%2Fbar",
      );
    });
  });

  describe("parseReviewUri", () => {
    it("parses a review URI", () => {
      expect(parseReviewUri("review://wf_abc?exec=exec_1")).toEqual({
        instanceId: "wf_abc",
        stepExecId: "exec_1",
      });
    });

    it("decodes exec ids with special characters", () => {
      expect(parseReviewUri("review://wf_abc?exec=foo%2Fbar")).toEqual({
        instanceId: "wf_abc",
        stepExecId: "foo/bar",
      });
    });

    it("returns null for a non-review URI", () => {
      expect(parseReviewUri("run://wf_abc")).toBeNull();
      expect(parseReviewUri("")).toBeNull();
    });

    it("returns null when instance id or exec is missing", () => {
      expect(parseReviewUri("review://wf_abc")).toBeNull();
      expect(parseReviewUri("review://?exec=exec_1")).toBeNull();
      expect(parseReviewUri("review://wf_abc?exec=")).toBeNull();
    });

    it("round-trips through reviewUriFor", () => {
      const uri = reviewUriFor("wf_xyz", "exec_42");
      expect(parseReviewUri(uri)).toEqual({
        instanceId: "wf_xyz",
        stepExecId: "exec_42",
      });
    });
  });
});
