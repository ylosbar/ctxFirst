/**
 * Replay neutre du JSONL Pi vers une projection `ChatEntry` consommable par
 * l'UI. On filtre les entries non pertinentes (compactions, custom, model
 * changes…) et on garde uniquement les messages user / assistant.
 *
 * On délègue le parsing à Pi (via `SessionManager.open` + `getEntries()`)
 * pour suivre automatiquement les migrations de format JSONL.
 */
import type { ChatEntry } from "./chat-event-types";
import { stripLiveContextPreamble } from "./system-prompt";

const tsToIso = (ts: number | undefined): string =>
  ts ? new Date(ts).toISOString() : new Date().toISOString();

// On lit le format Pi (`AgentMessage` = `UserMessage | AssistantMessage |
// ToolResultMessage`, cf. @earendil-works/pi-ai types) :
//   - assistant.content : parts `text` / `thinking` / `toolCall`
//   - toolResult        : message top-level avec `toolCallId`, `toolName`,
//                         `content` (parts text/image), `isError`
//   - user.content      : string | parts `text` / `image`
// Si Pi évolue (renommage, nouveau type), ce replay casse silencieusement —
// c'est volontairement couplé pour éviter une couche d'abstraction prématurée.
// Voir la spec `specs/chat-tool-call-rendering.md` § Risques.
export const loadChatEntries = async (jsonlPath: string): Promise<ChatEntry[]> => {
  const { SessionManager } = await import("@earendil-works/pi-coding-agent");
  const sm = SessionManager.open(jsonlPath);
  const entries = sm.getEntries();
  const out: ChatEntry[] = [];
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    const ts = tsToIso(msg.timestamp);

    if (msg.role === "assistant") {
      const parts = Array.isArray(msg.content) ? msg.content : [];
      const text = parts.map((p) => (p.type === "text" ? p.text : "")).join("");
      if (text.trim()) {
        out.push({
          type: "assistant_message",
          entryId: entry.id,
          text,
          timestamp: ts,
        });
      }
      for (const part of parts) {
        if (part.type === "toolCall") {
          out.push({
            type: "tool_use",
            entryId: entry.id,
            toolCallId: part.id,
            name: part.name,
            input: part.arguments,
            timestamp: ts,
          });
        }
      }
      continue;
    }

    if (msg.role === "toolResult") {
      out.push({
        type: "tool_result",
        entryId: entry.id,
        toolCallId: msg.toolCallId,
        content: msg.content,
        isError: msg.isError,
        timestamp: ts,
      });
      continue;
    }

    if (msg.role === "user") {
      const raw =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map((p) => (p.type === "text" ? p.text : "")).join("");
      // Le préambule `<view-context>` injecté à l'envoi (cf. chat-service)
      // est persisté dans le JSONL ; on le retire au replay pour n'afficher
      // que le message réellement tapé par l'utilisateur.
      const text = stripLiveContextPreamble(raw);
      if (text.trim()) {
        out.push({
          type: "user_message",
          entryId: entry.id,
          text,
          timestamp: ts,
        });
      }
    }
  }
  return out;
};
