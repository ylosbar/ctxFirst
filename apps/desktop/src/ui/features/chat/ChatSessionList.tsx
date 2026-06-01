import { Trash2 } from "lucide-react";
import { useT } from "@/ui/i18n";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { ChatSessionSummary } from "@/application/ports/chat-gateway";

type ChatSessionListProps = {
  sessions: ReadonlyArray<ChatSessionSummary>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString();
};

const ChatSessionList = ({
  sessions,
  activeId,
  onSelect,
  onDelete,
}: ChatSessionListProps) => {
  const t = useT();
  if (sessions.length === 0) {
    return <EmptyState description={t("chat.chatSessionList.empty")} />;
  }
  return (
    <ul className="flex flex-col">
      {sessions.map((s) => (
        <li key={s.id}>
          <div
            className={cn(
              "group flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/60",
              activeId === s.id && "bg-muted",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className="flex flex-1 flex-col items-start gap-0.5 truncate text-left"
            >
              <span className="w-full truncate font-medium">{s.title}</span>
              <span className="w-full truncate text-xs text-muted-foreground">
                {t("chat.chatSessionList.sessionMeta", { date: formatDate(s.createdAt), model: s.model })}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              title={t("chat.chatSessionList.deleteTitle")}
              className="opacity-0 group-hover:opacity-100"
            >
              <Trash2 />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default ChatSessionList;
