import { describe, expect, it } from "vitest";
import type { ChatViewContextSnapshot } from "./domain/chat-session";
import { formatLiveContextPreamble, stripLiveContextPreamble } from "./system-prompt";

const snapshot = (over: Partial<ChatViewContextSnapshot> = {}): ChatViewContextSnapshot => ({
  scope: "template",
  label: "Template: branch-verdict-demo@v1",
  data: { templateRef: "branch-verdict-demo@v1", stepCount: 4 },
  ...over,
});

describe("stripLiveContextPreamble", () => {
  it("removes a leading preamble produced by formatLiveContextPreamble", () => {
    const userMessage = "get le workflow";
    const wrapped = formatLiveContextPreamble(snapshot()) + userMessage;
    expect(stripLiveContextPreamble(wrapped)).toBe(userMessage);
  });

  it("is a no-op when there is no preamble", () => {
    expect(stripLiveContextPreamble("just a question")).toBe("just a question");
  });

  it("preserves a <view-context> the user typed mid-message (only strips a leading block)", () => {
    const text = "explique ce que fait <view-context> dans le code";
    expect(stripLiveContextPreamble(text)).toBe(text);
  });

  it("strips only the first preamble, keeping the rest of the message intact", () => {
    const wrapped =
      formatLiveContextPreamble(snapshot()) + "ligne 1\n\nligne 2 avec ```json``` dedans";
    expect(stripLiveContextPreamble(wrapped)).toBe("ligne 1\n\nligne 2 avec ```json``` dedans");
  });
});
