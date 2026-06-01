import type { StepExecStatus } from "../../../domain/workflow/types";

export type GanttBar = {
  readonly stepExecId: string;
  readonly stepId: string;
  readonly label: string;
  readonly status: StepExecStatus;
  readonly startMs: number;
  readonly durationMs: number;
  readonly inProgress: boolean;
  readonly error?: string;
};

export type GanttRow = {
  readonly stepId: string;
  readonly label: string;
  readonly order: number;
  readonly bars: ReadonlyArray<GanttBar>;
  readonly cumulativeMs: number;
  readonly aggregatedStatus: StepExecStatus;
};

export type StatusCounts = Readonly<Record<StepExecStatus, number>>;

export type RunSummary = {
  /** Real elapsed time between the earliest start and the latest end (or now for in-progress). */
  readonly wallClockMs: number;
  /** Sum of every bar duration — > wallClockMs would mean parallelism (no parallelism today, so it equals wallClockMs minus idle gaps). */
  readonly computeMs: number;
  /** Per-status counts across `instance.executions` (including pending / skipped that don't appear in rows). */
  readonly statusCounts: StatusCounts;
  /** Number of steps that ran more than once (loop bodies, retries via loopFrom). */
  readonly retriedStepsCount: number;
  /** Number of step executions that captured human feedback (gates traversed). */
  readonly humanGatesCount: number;
};

export type GanttModel = {
  readonly t0Ms: number;
  readonly tEndMs: number;
  readonly rows: ReadonlyArray<GanttRow>;
  readonly skippedCount: number;
  readonly summary: RunSummary;
};
