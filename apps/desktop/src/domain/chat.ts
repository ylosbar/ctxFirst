export type Usage = {
  input: number;
  output: number;
  cacheCreate?: number;
  cacheRead?: number;
};

export type TextTurn = {
  role: "user" | "assistant";
  text: string;
  usage?: Usage;
};

export type ToolUseTurn = {
  role: "tool_use";
  id: string;
  name: string;
  input: unknown;
  usage?: Usage;
};

export type ToolResultTurn = {
  role: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
};

export type Turn = TextTurn | ToolUseTurn | ToolResultTurn;

export type ChatEvent =
  | { kind: "text"; text: string }
  | { kind: "tool_use"; id: string; name: string; input: unknown }
  | {
      kind: "tool_result";
      tool_use_id: string;
      content: unknown;
      is_error?: boolean;
    }
  | { kind: "usage"; usage: Usage };

export const totalTokens = (u: Usage): number =>
  u.input + u.output + (u.cacheCreate ?? 0) + (u.cacheRead ?? 0);

export const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheCreate: (a.cacheCreate ?? 0) + (b.cacheCreate ?? 0),
  cacheRead: (a.cacheRead ?? 0) + (b.cacheRead ?? 0),
});

export const emptyUsage: Usage = { input: 0, output: 0 };

export function appendEvent(turns: Turn[], event: ChatEvent): Turn[] {
  if (event.kind === "text") {
    return [...turns, { role: "assistant", text: event.text }];
  }
  if (event.kind === "tool_use") {
    return [
      ...turns,
      { role: "tool_use", id: event.id, name: event.name, input: event.input },
    ];
  }
  if (event.kind === "tool_result") {
    return [
      ...turns,
      {
        role: "tool_result",
        tool_use_id: event.tool_use_id,
        content: event.content,
        is_error: event.is_error,
      },
    ];
  }
  const last = turns[turns.length - 1];
  if (
    last &&
    ((last.role === "assistant") || last.role === "tool_use")
  ) {
    return [...turns.slice(0, -1), { ...last, usage: event.usage }];
  }
  return turns;
}
