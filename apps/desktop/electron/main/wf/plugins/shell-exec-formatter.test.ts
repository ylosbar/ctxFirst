import { describe, expect, it } from "vitest";
import type { ShellRunResult } from "../application/ports/outbound/shell-gateway";
import { formatStream, renderBranchSummary } from "./shell-exec-formatter";

const baseResult: ShellRunResult = {
  exitCode: 0,
  signal: null,
  stdout: "",
  stderr: "",
  truncated: { stdout: false, stderr: false },
  durationMs: 12,
};

describe("formatStream", () => {
  it("wraps a non-empty stream in a code fence", () => {
    expect(formatStream("hello\n", false)).toBe("```\nhello\n\n```\n");
  });

  it("emits a 'no output' marker when the stream is empty and not truncated", () => {
    expect(formatStream("", false)).toBe("_(no output)_\n");
  });

  it("emits a truncation marker when the stream is empty but was truncated", () => {
    expect(formatStream("", true)).toBe("_… [output truncated]_\n");
  });

  it("flags truncation after a non-empty body", () => {
    const md = formatStream("lots", true);
    expect(md).toBe("```\nlots\n```\n\n_… [output truncated]_\n");
  });

  it("escapes triple-backticks by using a longer fence", () => {
    const md = formatStream("```\nsome code\n```", false);
    expect(md).toMatch(/^````+\n```\nsome code\n```\n````+\n$/);
  });
});

describe("renderBranchSummary", () => {
  it("renders 'Exit 0' for the success branch", () => {
    expect(renderBranchSummary("success", { ...baseResult, exitCode: 0 })).toBe(
      "Exit 0\n",
    );
  });

  it("renders the exit code for a plain failure", () => {
    expect(renderBranchSummary("failure", { ...baseResult, exitCode: 1 })).toBe(
      "Exit 1\n",
    );
  });

  it("appends the signal when the process was killed", () => {
    const md = renderBranchSummary("failure", {
      ...baseResult,
      exitCode: "killed",
      signal: "SIGKILL",
    });
    expect(md).toBe("Exit killed — Signal SIGKILL\n");
  });

  it("renders the literal 'timeout' exit code", () => {
    expect(
      renderBranchSummary("failure", { ...baseResult, exitCode: "timeout" }),
    ).toBe("Exit timeout\n");
  });
});
