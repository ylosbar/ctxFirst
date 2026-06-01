import { type ReactNode } from "react";
import { Pin } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RUN_STATUS_STYLE } from "@/components/ui/step-status";
import { cn } from "@/lib/utils";
import type { InstanceSummaryView } from "../../domain/workflow/types";
import { useT } from "../i18n";

const formatRelative = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "à l'instant";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD} j`;
  return new Date(iso).toLocaleDateString();
};

export type InstanceListItemProps = {
  readonly instance: InstanceSummaryView;
  readonly isOpen?: boolean;
  readonly isActive?: boolean;
  readonly isPinned?: boolean;
  readonly onPick?: () => void;
  readonly trailing?: ReactNode;
};

const InstanceListItem = ({
  instance,
  isOpen = false,
  isActive = false,
  isPinned = false,
  onPick,
  trailing,
}: InstanceListItemProps) => {
  const t = useT();
  const style = RUN_STATUS_STYLE[instance.status];
  return (
    <div
      role={onPick ? "button" : undefined}
      tabIndex={onPick ? 0 : undefined}
      onClick={onPick}
      onKeyDown={(e) => {
        if (!onPick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      title={`${instance.templateId}@${instance.templateVersion} · ${instance.id}`}
      className={cn(
        "group relative flex w-full overflow-hidden rounded-md border text-left outline-none transition-colors",
        "focus-visible:ring-1 focus-visible:ring-ring",
        onPick && "cursor-pointer",
        isActive
          ? "border-border/80 bg-accent/60"
          : "border-transparent hover:border-border/60 hover:bg-accent/30",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "shrink-0 self-stretch transition-all",
          style.bar,
          isActive ? "w-[3px]" : "w-[2px] opacity-60",
        )}
      />

      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-xs font-medium leading-tight",
                isActive ? "text-foreground" : "text-foreground/90",
              )}
            >
              {instance.templateId}
            </span>
            {isOpen && !isActive ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      aria-label={t("components.instanceListItem.open")}
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/70"
                    />
                  }
                />
                <TooltipContent>{t("components.instanceListItem.open")}</TooltipContent>
              </Tooltip>
            ) : null}
            {isPinned ? (
              <Pin className="size-3 shrink-0 text-muted-foreground/70" />
            ) : null}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs leading-tight text-muted-foreground">
            <span className="shrink-0 font-mono text-muted-foreground/70">
              {instance.id.slice(0, 6)}
            </span>
            <span aria-hidden className="text-muted-foreground/30">
              {t("components.instanceListItem.separator")}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatRelative(instance.updatedAt)}
            </span>
            {instance.stepCount > 0 ? (
              <>
                <span aria-hidden className="text-muted-foreground/30">
                  {t("components.instanceListItem.separator")}
                </span>
                <span className="shrink-0 tabular-nums">
                  {t("components.instanceListItem.stepCount", { count: instance.stepCount })}
                </span>
              </>
            ) : null}
          </div>
        </div>
        {trailing}
      </div>
    </div>
  );
};

export default InstanceListItem;
