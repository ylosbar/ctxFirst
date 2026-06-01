import { Clock, MoreHorizontal, Pause, Pencil, Play } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ScheduleView } from "../../../domain/workflow/types";
import { formatAbsolute, formatRelative } from "./format-relative";
import { humanizeCron } from "./humanize-cron";
import { ScheduleContextMenu, ScheduleDropdownMenu } from "./ScheduleLeafMenu";

type Props = {
  readonly schedule: ScheduleView;
  readonly now: number;
  readonly busy: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onToggle: () => void;
  readonly onOpenLastRun: () => void;
};

const StatusDot = ({
  enabled,
  lastStatus,
}: {
  enabled: boolean;
  lastStatus: ScheduleView["lastStatus"];
}) => {
  if (!enabled) {
    return (
      <span
        aria-hidden
        className="mt-[3px] size-2 shrink-0 rounded-full border border-border bg-background"
      />
    );
  }
  if (lastStatus === "error") {
    return (
      <span aria-hidden className="relative mt-[3px] flex size-2 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-destructive/60" />
        <span className="relative inline-flex size-2 rounded-full bg-destructive" />
      </span>
    );
  }
  if (lastStatus === "ok") {
    return (
      <span
        aria-hidden
        className="mt-[3px] size-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_2px_var(--background)] dark:bg-emerald-400"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="mt-[3px] size-2 shrink-0 rounded-full bg-primary"
    />
  );
};

const ScheduleRow = ({
  schedule,
  now,
  busy,
  onEdit,
  onDelete,
  onToggle,
  onOpenLastRun,
}: Props) => {
  const human = humanizeCron(schedule.cron);
  const cadenceLabel = human ?? schedule.cron;
  const cadenceTitle = human ? `${human} (${schedule.cron})` : schedule.cron;
  const hasLastRun = Boolean(schedule.lastInstanceId);

  const trigger = (
    <div
      role="group"
      className={cn(
        "group/schedule relative flex gap-2 border-b border-border/40 px-3 py-2 transition-colors hover:bg-accent/30",
        !schedule.enabled && "opacity-65",
      )}
    >
      <StatusDot enabled={schedule.enabled} lastStatus={schedule.lastStatus} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
            {schedule.name}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
          <span className="truncate" title={cadenceTitle}>
            {cadenceLabel}
          </span>
          <span aria-hidden className="text-muted-foreground/50">
            ·
          </span>
          <span
            className="truncate font-mono text-muted-foreground/80"
            title={schedule.templateRef}
          >
            {schedule.templateRef}
          </span>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs">
          {schedule.enabled && schedule.nextRunAt ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex items-center gap-1 text-muted-foreground" />
                }
              >
                <Clock aria-hidden className="size-3" />
                <span className="tabular-nums">
                  {formatRelative(schedule.nextRunAt, now)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Prochain : {formatAbsolute(schedule.nextRunAt)}
              </TooltipContent>
            </Tooltip>
          ) : schedule.enabled ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground/60">
              <Clock aria-hidden className="size-3" />
              prochain : —
            </span>
          ) : (
            <span className="text-muted-foreground/60 italic">en pause</span>
          )}

          {schedule.lastRunAt ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasLastRun) onOpenLastRun();
                    }}
                    disabled={!hasLastRun}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      schedule.lastStatus === "ok" &&
                        "text-emerald-600 dark:text-emerald-400",
                      schedule.lastStatus === "error" && "text-destructive",
                      !schedule.lastStatus && "text-muted-foreground",
                      hasLastRun && "hover:underline",
                    )}
                  />
                }
              >
                <span aria-hidden>
                  {schedule.lastStatus === "ok"
                    ? "✓"
                    : schedule.lastStatus === "error"
                      ? "✗"
                      : "·"}
                </span>
                <span className="tabular-nums">
                  {formatRelative(schedule.lastRunAt, now)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {schedule.lastStatus === "error" && schedule.lastError
                  ? `Dernier : ${formatAbsolute(schedule.lastRunAt)} — ${schedule.lastError}`
                  : `Dernier : ${formatAbsolute(schedule.lastRunAt)}`}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "absolute right-2 top-1.5 flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-card/90 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity",
          "group-hover/schedule:opacity-100 focus-within:opacity-100",
          "has-[[data-popup-open]]:opacity-100",
        )}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                disabled={busy}
                aria-label={schedule.enabled ? "Désactiver" : "Activer"}
                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            }
          >
            {schedule.enabled ? (
              <Pause className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {schedule.enabled ? "Désactiver" : "Activer"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                disabled={busy}
                aria-label="Éditer"
                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            }
          >
            <Pencil className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Éditer</TooltipContent>
        </Tooltip>

        <ScheduleDropdownMenu
          enabled={schedule.enabled}
          hasLastRun={hasLastRun}
          onEdit={onEdit}
          onToggle={onToggle}
          onOpenLastRun={onOpenLastRun}
          onDelete={onDelete}
          trigger={
            <button
              type="button"
              aria-label="Plus d'actions"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          }
        />
      </div>
    </div>
  );

  return (
    <ScheduleContextMenu
      enabled={schedule.enabled}
      hasLastRun={hasLastRun}
      onEdit={onEdit}
      onToggle={onToggle}
      onOpenLastRun={onOpenLastRun}
      onDelete={onDelete}
      trigger={trigger}
    />
  );
};

export default ScheduleRow;
