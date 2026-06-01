import type { StepExecStatus } from "../../../domain/workflow/types";
import { STATUS_LABEL, STATUS_STYLE } from "@/components/ui/step-status";
import { formatDurationMs } from "./build-step-stats";
import type { RunSummary } from "./run-stats-types";

const STATUS_ORDER: ReadonlyArray<StepExecStatus> = [
  "validated",
  "failed",
  "awaitingHuman",
  "running",
  "looped",
  "pending",
  "skipped",
];

type Props = {
  readonly summary: RunSummary;
};

const RunStatsHeader = ({ summary }: Props) => {
  const visibleStatuses = STATUS_ORDER.filter(
    (s) => summary.statusCounts[s] > 0,
  );
  const idlePct =
    summary.wallClockMs > 0
      ? Math.max(
          0,
          Math.round(
            ((summary.wallClockMs - summary.computeMs) / summary.wallClockMs) *
              100,
          ),
        )
      : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-3 py-2 text-xs text-muted-foreground">
      <Stat label="Durée" value={formatDurationMs(summary.wallClockMs)} />
      <Stat
        label="Calcul"
        value={formatDurationMs(summary.computeMs)}
        hint={idlePct > 0 ? `${idlePct}% inactif` : undefined}
      />
      {visibleStatuses.length > 0 ? (
        <div className="flex items-center gap-2">
          {visibleStatuses.map((status) => (
            <StatusChip
              key={status}
              status={status}
              count={summary.statusCounts[status]}
            />
          ))}
        </div>
      ) : null}
      {summary.retriedStepsCount > 0 ? (
        <Stat
          label="Étapes rejouées"
          value={String(summary.retriedStepsCount)}
        />
      ) : null}
      {summary.humanGatesCount > 0 ? (
        <Stat
          label="Gates humaines"
          value={String(summary.humanGatesCount)}
        />
      ) : null}
    </div>
  );
};

const Stat = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="flex items-baseline gap-1">
    <span>{label}</span>
    <span className="font-medium tabular-nums text-foreground">{value}</span>
    {hint ? <span className="text-[10px]">({hint})</span> : null}
  </div>
);

const StatusChip = ({
  status,
  count,
}: {
  status: StepExecStatus;
  count: number;
}) => {
  const style = STATUS_STYLE[status];
  return (
    <span
      className="flex items-center gap-1"
      title={STATUS_LABEL[status]}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      <span className="tabular-nums text-foreground">{count}</span>
      <span>{STATUS_LABEL[status]}</span>
    </span>
  );
};

export default RunStatsHeader;
