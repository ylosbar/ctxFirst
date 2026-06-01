import { describe, expect, it } from "vitest";
import {
  isJudgeAuthor,
  judgeLoopAuthor,
  parseJudgeFeedback,
  parseJudgeJson,
  renderJudgeFeedback,
  type JudgeOutput,
} from "./judge-feedback";

describe("parseJudgeJson", () => {
  it("parses a well-formed approved verdict with no comments", () => {
    const raw = JSON.stringify({
      verdict: "approved",
      summary: "Looks good.",
    });
    const out = parseJudgeJson(raw);
    expect(out.verdict).toBe("approved");
    expect(out.summary).toBe("Looks good.");
    expect(out.comments).toEqual([]);
  });

  it("parses a rejected verdict with anchored comments", () => {
    const raw = JSON.stringify({
      verdict: "rejected",
      summary: "Missing edge cases.",
      comments: [
        { anchor: { startLine: 1, endLine: 3 }, body: "Empty input not handled" },
        { anchor: { startLine: 10, endLine: 10 }, body: "Off-by-one" },
      ],
    });
    const out = parseJudgeJson(raw);
    expect(out.verdict).toBe("rejected");
    expect(out.comments).toHaveLength(2);
    expect(out.comments[0].anchor).toEqual({ startLine: 1, endLine: 3 });
    expect(out.comments[1].anchor).toEqual({ startLine: 10, endLine: 10 });
  });

  it("strips a leading ```json fence the LLM might add", () => {
    const raw = "```json\n" + JSON.stringify({ verdict: "approved", summary: "ok" }) + "\n```";
    const out = parseJudgeJson(raw);
    expect(out.verdict).toBe("approved");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJudgeJson("not json")).toThrow(/not valid JSON/);
  });

  it("throws on unknown verdict value", () => {
    const raw = JSON.stringify({ verdict: "maybe", summary: "shrug" });
    expect(() => parseJudgeJson(raw)).toThrow(/invalid verdict/);
  });

  it("throws when summary is missing", () => {
    const raw = JSON.stringify({ verdict: "approved" });
    expect(() => parseJudgeJson(raw)).toThrow(/summary/);
  });

  it("clamps endLine to startLine when inverted", () => {
    const raw = JSON.stringify({
      verdict: "rejected",
      summary: "x",
      comments: [{ anchor: { startLine: 5, endLine: 2 }, body: "weird" }],
    });
    const out = parseJudgeJson(raw);
    expect(out.comments[0].anchor).toEqual({ startLine: 5, endLine: 5 });
  });
});

describe("renderJudgeFeedback / parseJudgeFeedback round-trip", () => {
  it("round-trips an approved verdict with no comments", () => {
    const original: JudgeOutput = {
      verdict: "approved",
      summary: "All good.",
      comments: [],
    };
    const rendered = renderJudgeFeedback(original);
    const parsed = parseJudgeFeedback(rendered);
    expect(parsed.summary).toBe("All good.");
    expect(parsed.comments).toEqual([]);
  });

  it("round-trips a rejected verdict with line-anchored comments", () => {
    const original: JudgeOutput = {
      verdict: "rejected",
      summary: "Misses two cases.",
      comments: [
        { anchor: { startLine: 12, endLine: 18 }, body: "Empty list crashes" },
        { anchor: { startLine: 42, endLine: 42 }, body: "Wrong return type" },
      ],
    };
    const rendered = renderJudgeFeedback(original);
    const parsed = parseJudgeFeedback(rendered);
    expect(parsed.summary).toBe("Misses two cases.");
    expect(parsed.comments).toHaveLength(2);
    expect(parsed.comments[0].anchor).toEqual({ startLine: 12, endLine: 18 });
    expect(parsed.comments[0].body).toBe("Empty list crashes");
    expect(parsed.comments[1].anchor).toEqual({ startLine: 42, endLine: 42 });
    expect(parsed.comments[1].body).toBe("Wrong return type");
  });

  it("falls back to summary-only when the input is free-form", () => {
    const parsed = parseJudgeFeedback("Just some prose, no verdict header.");
    expect(parsed.summary).toBe("Just some prose, no verdict header.");
    expect(parsed.comments).toEqual([]);
  });
});

describe("judgeLoopAuthor / isJudgeAuthor", () => {
  it("encodes / decodes the author convention", () => {
    const author = judgeLoopAuthor("step-judge-1");
    expect(author).toBe("llm.judge:step-judge-1");
    expect(isJudgeAuthor(author)).toBe(true);
    expect(isJudgeAuthor("user")).toBe(false);
  });
});
