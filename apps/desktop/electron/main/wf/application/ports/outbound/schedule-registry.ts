import type {
  ScheduleDraft,
  ScheduleId,
  ScheduleLastStatus,
  WorkflowSchedule,
} from "../../../domain/schedule";

/**
 * Outbound port for the cron schedules store.
 *
 * Two list operations on purpose: `list()` is channel-scoped (UI), but the
 * scheduler service needs `listAllEnabled()` because a cron runs in the
 * background regardless of which channel the user is currently viewing.
 */
export interface ScheduleRegistry {
  /** Schedules of the currently-active channel — feeds the UI list. */
  list(): Promise<ReadonlyArray<WorkflowSchedule>>;
  /** ALL enabled schedules across channels — consumed by the scheduler at boot/reload. */
  listAllEnabled(): Promise<ReadonlyArray<WorkflowSchedule>>;
  get(id: ScheduleId): Promise<WorkflowSchedule | null>;
  save(draft: ScheduleDraft): Promise<WorkflowSchedule>;
  setEnabled(id: ScheduleId, enabled: boolean): Promise<void>;
  delete(id: ScheduleId): Promise<void>;
  /** Records the outcome of a tick — called by the scheduler after each fire(). */
  recordRun(
    id: ScheduleId,
    run: {
      at: string;
      instanceId?: string;
      status: ScheduleLastStatus;
      error?: string;
    },
  ): Promise<void>;
}
