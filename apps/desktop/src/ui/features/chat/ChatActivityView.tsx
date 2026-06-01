/**
 * View principale du chat global, rendue comme panneau dockview ancré à
 * droite (cf. features/chat/contributions.ts). L'historique des conversations
 * est accessible via un bouton "Historique" qui ouvre une popup ; sinon la
 * conversation active occupe tout le panneau.
 *
 * Phase A : pas de NewConversationDialog (cf. Phase B + spec §10). Le bouton
 * "+ Nouveau" crée immédiatement une session avec le modèle par défaut Settings.
 */
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/ui/i18n";
import { Dialog } from "@base-ui/react/dialog";
import { History, Plus, RefreshCw, Settings, X } from "lucide-react";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useServices } from "@/ui/di/services-provider";
import type { ChatSessionSummary } from "@/application/ports/chat-gateway";
import type { SettingsGateway } from "@/application/ports/settings-gateway";
import { getActiveEditorChatContext } from "@/ui/workbench/active-context";
import { useWorkbench } from "@/ui/workbench/store";
import { WavesBackground } from "@/ui/workbench/Watermark";
import ChatSessionList from "./ChatSessionList";
import ChatConversation from "./ChatConversation";

const ChatActivityView = () => {
  const t = useT();
  const { chatGateway, settingsGateway } = useServices();
  const workbench = useWorkbench();
  const [sessions, setSessions] = useState<ReadonlyArray<ChatSessionSummary>>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await chatGateway.listSessions();
      setSessions(list);
      // Auto-sélection : la plus récente si rien n'est sélectionné.
      if (!activeId && list.length > 0) setActiveId(list[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [chatGateway, activeId]);

  // Charge la liste au mount + vérifie qu'OpenRouter est configuré.
  useEffect(() => {
    void refresh();
    void settingsGateway.getOpenRouterStatus().then((s) => setNeedsKey(!s.hasApiKey));
  }, [refresh, settingsGateway]);

  const handleNew = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const status = await settingsGateway.getOpenRouterStatus();
      if (!status.hasApiKey) {
        setNeedsKey(true);
        return;
      }
      const session = await chatGateway.createSession({
        initialContext: getActiveEditorChatContext(),
        model: `openrouter:${status.defaultModel}`,
      });
      // Append local puis switch — évite un round-trip de re-listing.
      setSessions((prev) => [
        { id: session.id, title: session.title, createdAt: session.createdAt, model: session.model },
        ...prev,
      ]);
      setActiveId(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }, [chatGateway, settingsGateway]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await chatGateway.deleteSession(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (activeId === id) setActiveId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [chatGateway, activeId],
  );

  const handleSelectFromHistory = useCallback((id: string) => {
    setActiveId(id);
    setHistoryOpen(false);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex items-center justify-end border-b px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void refresh()}
            title={t("chat.chatActivityView.refreshTitle")}
          >
            <RefreshCw />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              void refresh();
              setHistoryOpen(true);
            }}
            title={t("chat.chatActivityView.historyTitle")}
          >
            <History />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void handleNew()}
            disabled={creating || needsKey}
            title={t("chat.chatActivityView.newTitle")}
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => workbench.hideView("chat.main")}
            title={t("chat.chatActivityView.closeTitle")}
          >
            <X />
          </Button>
        </div>
      </header>
      {needsKey ? (
        <NeedsOpenRouterKey settingsGateway={settingsGateway} />
      ) : activeId ? (
        <ChatConversation key={activeId} sessionId={activeId} />
      ) : (
        <div className="relative flex flex-1 overflow-hidden">
          <WavesBackground />
          <EmptyState
            description={t("chat.chatActivityView.emptyDescription")}
            className="flex-1"
          />
        </div>
      )}
      {error ? (
        <div className="border-t border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <ChatHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        sessions={sessions}
        activeId={activeId}
        onSelect={handleSelectFromHistory}
        onDelete={handleDelete}
      />
    </div>
  );
};

type ChatHistoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: ReadonlyArray<ChatSessionSummary>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

const ChatHistoryDialog = ({
  open,
  onOpenChange,
  sessions,
  activeId,
  onSelect,
  onDelete,
}: ChatHistoryDialogProps) => {
  const t = useT();
  return (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[1px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <Dialog.Popup className="fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[680px] max-w-[92vw] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_20px_50px_-12px_color-mix(in_srgb,var(--foreground)_28%,transparent)] outline-none transition-all duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <Dialog.Title className="text-sm font-semibold">
            {t("chat.chatActivityView.historyDialogTitle")}
          </Dialog.Title>
          <Dialog.Close
            aria-label={t("common.close")}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </Dialog.Close>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ChatSessionList
            sessions={sessions}
            activeId={activeId}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        </ScrollArea>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
  );
};

const NeedsOpenRouterKey = ({ settingsGateway: _ }: { settingsGateway: SettingsGateway }) => {
  const t = useT();
  return (
  <EmptyState
    icon={<Settings />}
    description={
      <>
        {t("chat.chatActivityView.needsKeyPrefix")}{" "}
        <span className="font-medium text-foreground">{t("chat.chatActivityView.needsKeySettings")}</span>{" "}
        {t("chat.chatActivityView.needsKeySuffix")}
      </>
    }
  />
  );
};

export default ChatActivityView;
