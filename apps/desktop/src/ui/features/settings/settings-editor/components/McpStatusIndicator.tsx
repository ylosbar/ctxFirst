import { cn } from "@/lib/utils";
import { useT } from "@/ui/i18n";
import type { McpServerStatus } from "@/application/ports/settings-gateway";

type McpStatusIndicatorProps = {
  /** `null` while the first status fetch is in flight. */
  status: McpServerStatus | null;
};

const McpStatusIndicator = ({ status }: McpStatusIndicatorProps) => {
  const t = useT();
  const tone =
    status === null ? "unknown" : status.running ? "online" : "offline";
  const label =
    tone === "online"
      ? t("settings.mcp.status.online")
      : tone === "offline"
        ? t("settings.mcp.status.offline")
        : t("settings.mcp.status.checking");
  const title =
    tone === "offline" && status?.error
      ? t("settings.mcp.status.offlineError", { error: status.error })
      : tone === "online"
        ? t("settings.mcp.status.onlineTitle")
        : tone === "offline"
          ? t("settings.mcp.status.offlineTitle")
          : t("settings.mcp.status.checkingTitle");

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      role="status"
      title={title}
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 rounded-full",
          tone === "online" && "bg-emerald-500",
          tone === "offline" && "bg-red-500",
          tone === "unknown" && "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
};

export default McpStatusIndicator;
