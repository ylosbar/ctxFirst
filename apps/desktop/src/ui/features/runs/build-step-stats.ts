import type {
  InstanceView,
  StepExecStatus,
  StepExecutionView,
  TemplateView,
} from "../../../domain/workflow/types";
import type {
  GanttBar,
  GanttModel,
  GanttRow,
  RunSummary,
  StatusCounts,
} from "./run-stats-types";

export type BuildStepStatsArgs = {
  readonly instance: InstanceView;
  readonly template: TemplateView | null;
  readonly nowMs?: number;
};

const ZERO_STATUS_COUNTS: StatusCounts = {
  pending: 0,
  running: 0,
  awaitingHuman: 0,
  awaitingChild: 0,
  validated: 0,
  looped: 0,
  failed: 0,
  skipped: 0,
};

const EMPTY_SUMMARY: RunSummary = {
  wallClockMs: 0,
  computeMs: 0,
  statusCounts: ZERO_STATUS_COUNTS,
  retriedStepsCount: 0,
  humanGatesCount: 0,
};

const EMPTY_MODEL: GanttModel = {
  t0Ms: 0,
  tEndMs: 0,
  rows: [],
  skippedCount: 0,
  summary: EMPTY_SUMMARY,
};

const countStatuses = (
  executions: ReadonlyArray<StepExecutionView>,
): StatusCounts => {
  const counts: Record<StepExecStatus, number> = { ...ZERO_STATUS_COUNTS };
  for (const exec of executions) counts[exec.status] += 1;
  return counts;
};

const countHumanGates = (
  executions: ReadonlyArray<StepExecutionView>,
): number => executions.reduce((n, e) => (e.humanFeedback ? n + 1 : n), 0);

const T_END_MARGIN = 0.05;

const STATUS_PRIORITY: ReadonlyArray<StepExecStatus> = [
  "failed",
  "running",
  "awaitingHuman",
  "awaitingChild",
  "pending",
  "validated",
  "looped",
  "skipped",
];

const pickWorstStatus = (
  statuses: ReadonlyArray<StepExecStatus>,
): StepExecStatus => {
  for (const candidate of STATUS_PRIORITY) {
    if (statuses.includes(candidate)) return candidate;
  }
  return statuses[0];
};

export const formatDurationMs = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) {
    const sec = ms / 1000;
    return sec < 10 ? `${sec.toFixed(1)}s` : `${Math.round(sec)}s`;
  }
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, "0")}s`;
};

export const buildStepStats = (args: BuildStepStatsArgs): GanttModel => {
  const { instance, template } = args;
  const nowMs = args.nowMs ?? Date.now();

  if (!template) return EMPTY_MODEL;
  if (instance.executions.length === 0) return EMPTY_MODEL;

  const statusCounts = countStatuses(instance.executions);
  const humanGatesCount = countHumanGates(instance.executions);
  const skippedCount = statusCounts.skipped;

  const considered: StepExecutionView[] = [];
  for (const exec of instance.executions) {
    if (exec.status === "skipped") continue;
    if (!exec.startedAt) continue;
    considered.push(exec);
  }

  if (considered.length === 0) {
    return {
      ...EMPTY_MODEL,
      skippedCount,
      summary: {
        wallClockMs: 0,
        computeMs: 0,
        statusCounts,
        retriedStepsCount: 0,
        humanGatesCount,
      },
    };
  }

  const stepIndex = new Map<string, number>();
  const stepName = new Map<string, string>();
  template.steps.forEach((s, i) => {
    stepIndex.set(s.id, i);
    stepName.set(s.id, s.name);
  });

  let t0Ms = Number.POSITIVE_INFINITY;
  let rawTEndMs = Number.NEGATIVE_INFINITY;
  const startedMsByExec = new Map<string, number>();
  // Bar end = end of *compute time*. Falls back to `endedAt` for legacy
  // events without `executionEndedAt`, and to `nowMs` for steps that are
  // still actively running (no terminal/gate event yet).
  const execEndedMsByExec = new Map<string, number>();
  // Timeline end = end of *wall-clock time* (includes human wait). Drives
  // the x-axis extent so the chart spans the real elapsed time of the run.
  const wallEndedMsByExec = new Map<string, number>();

  for (const exec of considered) {
    const startedMs = Date.parse(exec.startedAt as string);
    const wallEndedMs = exec.endedAt ? Date.parse(exec.endedAt) : nowMs;
    const execEndedMs = exec.executionEndedAt
      ? Date.parse(exec.executionEndedAt)
      : wallEndedMs;
    startedMsByExec.set(exec.id, startedMs);
    execEndedMsByExec.set(exec.id, execEndedMs);
    wallEndedMsByExec.set(exec.id, wallEndedMs);
    if (startedMs < t0Ms) t0Ms = startedMs;
    if (wallEndedMs > rawTEndMs) rawTEndMs = wallEndedMs;
  }

  const span = Math.max(rawTEndMs - t0Ms, 0);
  const tEndMs = t0Ms + span * (1 + T_END_MARGIN);

  const barsByStep = new Map<string, GanttBar[]>();
  for (const exec of considered) {
    const startedMs = startedMsByExec.get(exec.id) as number;
    const endedMs = execEndedMsByExec.get(exec.id) as number;
    // "In progress" = work is still being done. A step in `awaitingHuman`
    // has finished its compute, so it's NOT in progress (its bar should
    // freeze at `executionEndedAt`, not grow with `nowMs`).
    const inProgress = !exec.executionEndedAt && !exec.endedAt;
    const bar: GanttBar = {
      stepExecId: exec.id,
      stepId: exec.stepId,
      label: stepName.get(exec.stepId) ?? exec.stepId,
      status: exec.status,
      startMs: startedMs - t0Ms,
      durationMs: Math.max(endedMs - startedMs, 0),
      inProgress,
      error: exec.error,
    };
    const list = barsByStep.get(exec.stepId);
    if (list) list.push(bar);
    else barsByStep.set(exec.stepId, [bar]);
  }

  const rows: GanttRow[] = [];
  for (const [stepId, bars] of barsByStep) {
    const sortedBars = [...bars].sort((a, b) => a.startMs - b.startMs);
    const cumulativeMs = sortedBars.reduce((acc, b) => acc + b.durationMs, 0);
    const aggregatedStatus = pickWorstStatus(sortedBars.map((b) => b.status));
    rows.push({
      stepId,
      label: stepName.get(stepId) ?? stepId,
      order: stepIndex.get(stepId) ?? Number.MAX_SAFE_INTEGER,
      bars: sortedBars,
      cumulativeMs,
      aggregatedStatus,
    });
  }

  rows.sort((a, b) => a.order - b.order);

  const computeMs = rows.reduce((acc, r) => acc + r.cumulativeMs, 0);
  const retriedStepsCount = rows.reduce(
    (n, r) => (r.bars.length > 1 ? n + 1 : n),
    0,
  );

  return {
    t0Ms,
    tEndMs,
    rows,
    skippedCount,
    summary: {
      wallClockMs: span,
      computeMs,
      statusCounts,
      retriedStepsCount,
      humanGatesCount,
    },
  };
};
