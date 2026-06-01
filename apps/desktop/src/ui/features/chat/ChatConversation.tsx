import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "@/ui/i18n";
import { Send, Settings2, Square } from "lucide-react";
import Button from "@/components/ui/button";
import Textarea from "@/components/ui/textarea";
import EmptyState from "@/components/ui/empty-state";
import { ScrollArea, type ScrollAreaHandle } from "@/components/ui/scroll-area";
import { Select } from "@/components/ui/select";
import { useServices } from "@/ui/di/services-provider";
import { getActiveEditorChatContext } from "@/ui/workbench/active-context";
import { WavesBackground } from "@/ui/workbench/Watermark";
import type { OpenRouterStatus } from "@/application/ports/settings-gateway";
import { useChatSession } from "./use-chat-session";
import ChatContextPill from "./ChatContextPill";
import ChatContextUsage from "./ChatContextUsage";
import ChatMessage from "./ChatMessage";
import ChatSystemPromptDialog from "./ChatSystemPromptDialog";
import ChatToolConfirmRow from "./ChatToolConfirmRow";
import ChatToolRow from "./ChatToolRow";

/**
 * Modèles stockés en SQLite avec préfixe provider (ex. "openrouter:openai/gpt-4o-mini").
 * Les ids OpenRouter visibles dans Settings sont sans préfixe — on convertit
 * dans les deux sens pour que le sélecteur compare des valeurs cohérentes.
 */
const stripProviderPrefix = (raw: string): string =>
  raw.startsWith("openrouter:") ? raw.slice("openrouter:".length) : raw;

const withProviderPrefix = (modelId: string): string =>
  modelId.startsWith("openrouter:") ? modelId : `openrouter:${modelId}`;

type ChatConversationProps = {
  sessionId: string;
};

const ChatConversation = ({ sessionId }: ChatConversationProps) => {
  const t = useT();
  const { chatGateway, settingsGateway } = useServices();
  const {
    session,
    timeline,
    streaming,
    isStreaming,
    error,
    pendingConfirmations,
    contextUsage,
    sendMessage,
    abort,
    respondConfirmation,
    changeModel,
  } = useChatSession(chatGateway, sessionId);
  const [draft, setDraft] = useState("");
  const [orStatus, setOrStatus] = useState<OpenRouterStatus | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const scrollRef = useRef<ScrollAreaHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    void settingsGateway
      .getOpenRouterStatus()
      .then((s) => {
        if (!cancelled) setOrStatus(s);
      })
      .catch((err) => {
        console.warn("[chat] failed to load OpenRouter models:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [settingsGateway]);

  // Auto-scroll vers le bas à chaque nouveau delta. Naïf (toujours sticky), à
  // affiner si l'utilisateur veut pouvoir remonter dans l'historique sans
  // être renvoyé en bas — pas pertinent en Phase A où les conversations sont
  // courtes.
  useEffect(() => {
    const vp = scrollRef.current?.viewport;
    if (!vp) return;
    vp.scrollTop = vp.scrollHeight;
  }, [timeline, streaming]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || isStreaming) return;
    setDraft("");
    const liveContext = getActiveEditorChatContext();
    await sendMessage(text, liveContext);
  }, [draft, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter envoie, Shift+Enter = saut de ligne (convention Slack/Cursor).
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleModelChange = useCallback(
    async (next: string) => {
      if (!next || isStreaming) return;
      const current = session?.model ? stripProviderPrefix(session.model) : null;
      if (current === next) return;
      await changeModel(withProviderPrefix(next));
    },
    [changeModel, isStreaming, session?.model],
  );

  const currentModelId = session?.model ? stripProviderPrefix(session.model) : "";
  // Inclut le modèle courant même s'il n'est plus dans la liste curée (cas
  // d'une session ancienne dont le modèle a été retiré depuis), pour que
  // l'option sélectionnée reste affichée.
  const availableModels = (() => {
    const base = orStatus?.models ?? [];
    if (!currentModelId || base.includes(currentModelId)) return base;
    return [...base, currentModelId];
  })();

  // Apparie chaque tool_result à son tool_use (même toolCallId) pour les
  // fusionner en une seule pill. Dans la timeline le tool_result suit toujours
  // son tool_use, mais on indexe par id pour rester robuste à un éventuel
  // décalage. Les tool_result orphelins (aucun tool_use correspondant) restent
  // rendus seuls en repli.
  const { resultByCallId, toolUseIds } = useMemo(() => {
    const results = new Map<string, { content: unknown; isError: boolean }>();
    const uses = new Set<string>();
    for (const item of timeline) {
      if (item.kind === "tool_result") {
        results.set(item.toolCallId, { content: item.content, isError: item.isError });
      } else if (item.kind === "tool_use") {
        uses.add(item.toolCallId);
      }
    }
    return { resultByCallId: results, toolUseIds: uses };
  }, [timeline]);

  const streamingEntries = Object.entries(streaming);
  const pendingConfirmEntries = Object.values(pendingConfirmations);

  const isEmpty =
    timeline.length === 0 &&
    streamingEntries.length === 0 &&
    pendingConfirmEntries.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isEmpty ? (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <WavesBackground />
          <EmptyState
            title={
              <span className="inline-block animate-in fade-in-0 slide-in-from-bottom-1 duration-700">
                {t("chat.chatConversation.emptyTitle")}
              </span>
            }
            description={
              <span className="inline-block animate-in fade-in-0 slide-in-from-bottom-1 duration-700 delay-200">
                {t("chat.chatConversation.emptyModel", { model: session?.model ?? "—" })}
              </span>
            }
            className="flex-1"
          />
        </div>
      ) : (
        <ScrollArea ref={scrollRef} className="min-h-0 flex-1">
          <div className="space-y-3 px-3 py-3">
            {timeline.map((item) => {
              switch (item.kind) {
                case "text":
                  return (
                    <ChatMessage
                      key={item.entryId}
                      role={item.role}
                      text={item.text}
                      timestamp={item.timestamp}
                    />
                  );
                case "tool_use":
                  return (
                    <ChatToolRow
                      key={`tu:${item.toolCallId}`}
                      toolCallId={item.toolCallId}
                      name={item.name}
                      input={item.input}
                      status={item.status}
                      result={resultByCallId.get(item.toolCallId)}
                    />
                  );
                case "tool_result":
                  // Fusionné dans la pill de son tool_use ci-dessus ; on ne le
                  // rend séparément que s'il est orphelin.
                  if (toolUseIds.has(item.toolCallId)) return null;
                  return (
                    <ChatToolRow
                      key={`tr:${item.toolCallId}`}
                      toolCallId={item.toolCallId}
                      name={t("chat.chatConversation.orphanResult")}
                      input={undefined}
                      status={item.isError ? "errored" : "completed"}
                      result={{ content: item.content, isError: item.isError }}
                    />
                  );
              }
            })}
            {streamingEntries.map(([entryId, text]) => (
              <ChatMessage
                key={entryId}
                role="assistant"
                text={text}
                streaming
              />
            ))}
            {pendingConfirmEntries.map((p) => (
              <ChatToolConfirmRow
                key={`cf:${p.toolCallId}`}
                toolCallId={p.toolCallId}
                toolName={p.toolName}
                args={p.args}
                onRespond={respondConfirmation}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      {error ? (
        <div className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <div className="border-t bg-background px-3 py-2">
        <div className="mb-1.5 flex items-center gap-2">
          <ChatContextPill />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setPromptDialogOpen(true)}
            title={t("chat.chatConversation.systemPromptTitle")}
            aria-label={t("chat.chatConversation.systemPromptLabel")}
          >
            <Settings2 />
          </Button>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <ChatContextUsage usage={contextUsage} />
            <Select
              value={currentModelId}
              onChange={(e) => void handleModelChange(e.target.value)}
              disabled={isStreaming || availableModels.length === 0}
              title={t("chat.chatConversation.modelSelectTitle")}
              className="w-auto min-w-0 max-w-[60%] truncate font-mono"
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("chat.chatConversation.inputPlaceholder")}
            className="min-h-10 max-h-40"
            size="sm"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button variant="outline" size="icon-sm" onClick={() => void abort()} title={t("chat.chatConversation.stopTitle")}>
              <Square />
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon-sm"
              onClick={() => void handleSend()}
              disabled={!draft.trim()}
              title={t("chat.chatConversation.sendTitle")}
            >
              <Send />
            </Button>
          )}
        </div>
      </div>
      <ChatSystemPromptDialog
        open={promptDialogOpen}
        onOpenChange={setPromptDialogOpen}
      />
    </div>
  );
};

export default ChatConversation;
