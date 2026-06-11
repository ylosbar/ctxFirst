import {
  CornerDownRight,
  RotateCcw,
  RotateCw,
  UserCheck,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_STYLE } from "@/components/ui/step-status";
import type { StepExecStatus } from "../../../../../domain/workflow/types";
import { useT } from "../../../../i18n";
import { formatDurationMs } from "../../build-step-stats";
import type { TimelineRow } from "../../timeline-types";
import { useTickingNow } from "../../useTickingNow";
import { INDENT_STEP_REM, indentStyle } from "../parts/indent";
import { formatClock } from "../parts/format-clock";

type RowProps = {
  readonly row: TimelineRow;
  readonly depth: number;
  readonly isSelected: boolean;
  readonly onClick: () => void;
  readonly onRerun: () => void;
  readonly onOpenChild: (childInstanceId: string) => void;
};

/**
 * Live-ticking compute duration for an in-progress row. The clock lives here,
 * at the leaf, so a run's per-second tick re-renders only this tiny node — the
 * timeline model and tree stay put (perf P2). Unmounts (and stops ticking) the
 * moment the row settles and switches back to its frozen `durationMs`.
 */
const LiveDuration = ({ startedAtMs }: { readonly startedAtMs: number }) => {
  const now = useTickingNow(1000);
  return <>{formatDurationMs(Math.max(now - startedAtMs, 0))}</>;
};

const StatusDot = ({
  status,
  inProgress,
}: {
  readonly status: StepExecStatus;
  readonly inProgress: boolean;
}) => (
  <span
    className={cn(
      "mt-1.5 inline-block size-2.5 shrink-0 rounded-full",
      STATUS_STYLE[status].dot,
      inProgress && "animate-pulse",
    )}
    aria-hidden
  />
);

const TimelineRowItem = ({
  row,
  depth,
  isSelected,
  onClick,
  onRerun,
  onOpenChild,
}: RowProps) => {
  const t = useT();
  const isRetry = row.retryOfStepExecId !== null;
  // "Relancer depuis ici" is offered on any settled exec (validated or failed):
  // the rewind & replay rebuilds the target and its downstream.
  const canRerun = row.status === "validated" || row.status === "failed";
  return (
    <div className="group/row relative">
      <button
        type="button"
        onClick={onClick}
        aria-selected={isSelected}
        style={indentStyle(depth, isRetry ? INDENT_STEP_REM : 0)}
        className={cn(
          "relative flex w-full items-start gap-3 py-2 pr-3 text-left transition-colors",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          // Status tint: surface the active step (blue) and any failure (red)
          // beyond the badge, so they pop while scanning a long timeline.
          row.inProgress && "bg-blue-500/5",
          row.hasError && "bg-destructive/5",
          isSelected &&
            "bg-accent ring-1 ring-ring/40 ring-inset",
        )}
      >
        {/* Status rail — a per-row colored spine on the far left, keyed to the
            step status, so the run reads top-to-bottom as a status column. */}
        <span
          className={cn(
            "absolute inset-y-0 left-0 w-[3px]",
            STATUS_STYLE[row.status].bar,
            row.inProgress && "animate-pulse",
          )}
          aria-hidden
        />
        <StatusDot status={row.status} inProgress={row.inProgress} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            {isRetry ? (
              <RotateCw
                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-label="reprise"
              />
            ) : null}
            <span className="truncate text-foreground">
              {row.label}
            </span>
            {row.iterationIndex > 1 ? (
              <span className="text-2xs text-muted-foreground">
                {t("runs.timeline.iteration", { n: row.iterationIndex })}
              </span>
            ) : null}
            {row.hasHumanGate ? (
              <UserCheck
                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-label="attente humaine"
              />
            ) : null}
            <span
              className={cn(
                "ml-2 rounded px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide",
                STATUS_STYLE[row.status].badgeBg,
                STATUS_STYLE[row.status].text,
              )}
            >
              {STATUS_LABEL[row.status]}
            </span>
            {row.childInstanceId ? (
              <span
                role="link"
                tabIndex={0}
                aria-label={t("runs.timeline.openChild")}
                title={t("runs.timeline.openChild")}
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.childInstanceId) onOpenChild(row.childInstanceId);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (row.childInstanceId) onOpenChild(row.childInstanceId);
                  }
                }}
                className="ml-1 inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-2xs text-primary outline-none hover:bg-primary/10 focus-visible:ring-1 focus-visible:ring-ring"
              >
                <CornerDownRight className="size-3" />
                {t("runs.timeline.openChild")}
              </span>
            ) : null}
          </div>
          {row.hasError && row.errorMessage ? (
            <div className="mt-1 flex items-start gap-1.5 text-2xs text-destructive">
              <XCircle className="mt-px size-3 shrink-0" />
              <span className="truncate" title={row.errorMessage}>
                {row.errorMessage}
              </span>
            </div>
          ) : null}
          {row.feedbackSummary || row.feedbackCommentCount > 0 ? (
            <div
              className="mt-1 truncate text-2xs italic text-muted-foreground"
              title={row.feedbackSummary ?? undefined}
            >
              {row.feedbackSummary
                ? `« ${row.feedbackSummary} »`
                : t("runs.timeline.feedbackComments", {
                    count: row.feedbackCommentCount,
                  })}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-2xs tabular-nums">
          {/* Duration is the primary metric (weight + status color when
              notable); the wall-clock start recedes as secondary context. */}
          <span
            className={cn(
              "font-medium text-muted-foreground",
              row.inProgress && "text-blue-600 dark:text-blue-400",
              row.hasError && "text-destructive",
            )}
          >
            {row.inProgress ? (
              <LiveDuration startedAtMs={row.startedAtMs} />
            ) : (
              formatDurationMs(row.durationMs)
            )}
          </span>
          <span className="text-muted-foreground/60">
            {formatClock(row.startedAtMs)}
          </span>
        </div>
      </button>
      {canRerun ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRerun();
          }}
          aria-label={t("runs.timeline.rerunFromHere")}
          title={t("runs.timeline.rerunFromHere")}
          className="absolute right-2 top-1.5 inline-flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-2xs text-muted-foreground opacity-0 shadow-sm ring-1 ring-border outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-ring group-hover/row:opacity-100"
        >
          <RotateCcw className="size-3" aria-hidden />
          {t("runs.timeline.rerunFromHere")}
        </button>
      ) : null}
    </div>
  );
};

export default TimelineRowItem;
