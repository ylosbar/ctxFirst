import { useMemo } from "react";
import { useT } from "@/ui/i18n";
import { CircleSlash, Pin } from "lucide-react";
import { getActiveEditorChatContext } from "@/ui/workbench/active-context";
import { useWorkbenchStore } from "@/ui/workbench/store";

/**
 * Pill anchored above the chat input that shows exactly what view context
 * will be attached to the next `sendMessage`. Updates when the active editor
 * URI changes. Doesn't reflect intra-editor draft mutations in v1 — the
 * `label` stays stable per URI (cf. spec §5 risks).
 */
const ChatContextPill = () => {
  const t = useT();
  const activeUri = useWorkbenchStore((s) => s.activeEditor?.uri ?? null);
  const ctx = useMemo(() => getActiveEditorChatContext(), [activeUri]);

  if (!ctx) {
    return (
      <span
        className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-2xs text-muted-foreground"
        title={t("chat.chatContextPill.noContextTitle")}
      >
        <CircleSlash className="size-3 shrink-0" />
        <span className="truncate">{t("chat.chatContextPill.noContext")}</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-2xs"
      title={t("chat.chatContextPill.willSendTitle", { label: ctx.label })}
    >
      <Pin className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium">{ctx.label}</span>
    </span>
  );
};

export default ChatContextPill;
