import type { ChatViewContextSnapshot } from "@/application/ports/chat-gateway";
import { workbenchRegistry } from "./registry";
import { useWorkbenchStore } from "./store";

/**
 * Pulls the chat context snapshot from the currently active editor.
 *
 * Synchronous and stateless: reads `activeEditor` from the workbench store,
 * looks up the matching `EditorTypeContribution`, calls its `getChatContext`.
 * Returns `null` when there's no active editor, no registered type, no
 * `getChatContext` implementation, or when the extractor returns `null`.
 *
 * Used by the chat feature at every `sendMessage` (so the LLM sees the live
 * view, not a stale snapshot from session creation) and once at session
 * creation (to persist the initial context for debug/inspector).
 */
export const getActiveEditorChatContext = (): ChatViewContextSnapshot | null => {
  const active = useWorkbenchStore.getState().activeEditor;
  if (!active) return null;
  const type = workbenchRegistry.editorTypeFor(active.uri);
  if (!type?.getChatContext) return null;
  try {
    return type.getChatContext(active.uri);
  } catch (err) {
    console.warn(`[chat:context] getChatContext threw for ${active.uri}:`, err);
    return null;
  }
};
