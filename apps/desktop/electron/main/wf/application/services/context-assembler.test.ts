import { describe, expect, it } from "vitest";
import { assemble, type AssembleInput } from "./context-assembler";
import type { HashPort } from "../ports/outbound/hash";

/**
 * Minimal deterministic stub: returns the concatenated parts so the test can
 * assert on stability and change-sensitivity without binding to SHA-256.
 */
const stubHash = (): HashPort => ({
  sha256: (parts) => parts.join("|"),
});

const baseInput: AssembleInput = {
  prompt: "",
  loopHistory: [],
};

describe("assemble — system prompt", () => {
  it("is always empty (system prompt was the Skill body, now removed)", () => {
    const { systemPrompt } = assemble(baseInput, stubHash());
    expect(systemPrompt).toBe("");
  });
});

describe("assemble — user prompt sections", () => {
  it("returns an empty user prompt when nothing is supplied", () => {
    expect(assemble(baseInput, stubHash()).userPrompt).toBe("");
  });

  it("uses the `prompt` port value as the user prompt body, trimmed", () => {
    const { userPrompt } = assemble(
      { ...baseInput, prompt: "  hello world  \n" },
      stubHash(),
    );
    expect(userPrompt).toBe("hello world");
  });

  it("prepends project context before the prompt body", () => {
    const { userPrompt } = assemble(
      {
        ...baseInput,
        projectContext: "no global state.",
        prompt: "do the thing",
      },
      stubHash(),
    );
    expect(userPrompt.indexOf("## Règles projet")).toBeLessThan(
      userPrompt.indexOf("do the thing"),
    );
    expect(userPrompt).toContain("## Règles projet\n\nno global state.");
  });

  it("omits project context when blank or whitespace-only", () => {
    const { userPrompt } = assemble(
      {
        ...baseInput,
        projectContext: "   \n  ",
        prompt: "do the thing",
      },
      stubHash(),
    );
    expect(userPrompt).not.toContain("## Règles projet");
  });
});

describe("assemble — loop history", () => {
  it("renders ordered attempts with previous output and feedback summary", () => {
    const { userPrompt } = assemble(
      {
        ...baseInput,
        loopHistory: [
          {
            previousOutput: "draft v1",
            humanFeedback: { summary: "too short", comments: [] },
          },
          {
            previousOutput: "draft v2",
            humanFeedback: { summary: "still too short", comments: [] },
          },
        ],
      },
      stubHash(),
    );
    expect(userPrompt).toContain("## Historique de boucle");
    expect(userPrompt).toContain("### Tentative 1");
    expect(userPrompt).toContain("### Tentative 2");
    expect(userPrompt.indexOf("### Tentative 1")).toBeLessThan(
      userPrompt.indexOf("### Tentative 2"),
    );
    expect(userPrompt).toContain("draft v1");
    expect(userPrompt).toContain("**Feedback humain :**\n\ntoo short");
  });

  it("omits the feedback header when summary is blank", () => {
    const { userPrompt } = assemble(
      {
        ...baseInput,
        loopHistory: [
          {
            previousOutput: "draft",
            humanFeedback: { summary: "   ", comments: [] },
          },
        ],
      },
      stubHash(),
    );
    expect(userPrompt).not.toContain("**Feedback humain :**");
  });

  it("renders single-line comments with `L<n>` and the cited line", () => {
    const { userPrompt } = assemble(
      {
        ...baseInput,
        loopHistory: [
          {
            previousOutput: "line one\nline two\nline three",
            humanFeedback: {
              summary: "",
              comments: [{ startLine: 2, endLine: 2, body: "rephrase" }],
            },
          },
        ],
      },
      stubHash(),
    );
    expect(userPrompt).toContain("- L2 :");
    expect(userPrompt).toContain("  > line two");
    expect(userPrompt).toContain("  rephrase");
  });

  it("renders multi-line comments with `L<a>-L<b>` and quoted range", () => {
    const { userPrompt } = assemble(
      {
        ...baseInput,
        loopHistory: [
          {
            previousOutput: "a\nb\nc\nd",
            humanFeedback: {
              summary: "",
              comments: [{ startLine: 2, endLine: 3, body: "merge these" }],
            },
          },
        ],
      },
      stubHash(),
    );
    expect(userPrompt).toContain("- L2-L3 :");
    expect(userPrompt).toContain("  > b");
    expect(userPrompt).toContain("  > c");
  });

  it("clamps out-of-range anchors to the file bounds (single line)", () => {
    const { userPrompt } = assemble(
      {
        ...baseInput,
        loopHistory: [
          {
            previousOutput: "only line",
            humanFeedback: {
              summary: "",
              comments: [{ startLine: 0, endLine: 99, body: "fix" }],
            },
          },
        ],
      },
      stubHash(),
    );
    expect(userPrompt).toContain("- L1 :");
    expect(userPrompt).toContain("  > only line");
  });

  it("clamps endLine to the file length on a multi-line range", () => {
    const { userPrompt } = assemble(
      {
        ...baseInput,
        loopHistory: [
          {
            previousOutput: "a\nb\nc",
            humanFeedback: {
              summary: "",
              comments: [{ startLine: 2, endLine: 99, body: "fix" }],
            },
          },
        ],
      },
      stubHash(),
    );
    expect(userPrompt).toContain("- L2-L3 :");
    expect(userPrompt).toContain("  > b");
    expect(userPrompt).toContain("  > c");
  });

  it("preserves the order in which sections appear: project / prompt / history", () => {
    const { userPrompt } = assemble(
      {
        ...baseInput,
        projectContext: "ctx",
        prompt: "do the thing",
        loopHistory: [
          {
            previousOutput: "old",
            humanFeedback: { summary: "redo", comments: [] },
          },
        ],
      },
      stubHash(),
    );
    const idxCtx = userPrompt.indexOf("## Règles projet");
    const idxBody = userPrompt.indexOf("do the thing");
    const idxLoop = userPrompt.indexOf("## Historique de boucle");
    expect(idxCtx).toBeGreaterThanOrEqual(0);
    expect(idxCtx).toBeLessThan(idxBody);
    expect(idxBody).toBeLessThan(idxLoop);
  });
});

describe("assemble — hash", () => {
  it("returns a stable digest for the same inputs", () => {
    const a = assemble(baseInput, stubHash());
    const b = assemble(baseInput, stubHash());
    expect(a.hash).toBe(b.hash);
  });

  it("changes when the prompt body changes", () => {
    const a = assemble(baseInput, stubHash());
    const b = assemble({ ...baseInput, prompt: "different" }, stubHash());
    expect(a.hash).not.toBe(b.hash);
  });

  it("changes when loop history changes", () => {
    const a = assemble(baseInput, stubHash());
    const b = assemble(
      {
        ...baseInput,
        loopHistory: [
          {
            previousOutput: "x",
            humanFeedback: { summary: "y", comments: [] },
          },
        ],
      },
      stubHash(),
    );
    expect(a.hash).not.toBe(b.hash);
  });
});
