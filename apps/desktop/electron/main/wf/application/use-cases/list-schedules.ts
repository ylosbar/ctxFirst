import { Cron } from "croner";
import type { ScheduleRegistry } from "../ports/outbound/schedule-registry";
import type { WorkflowSchedule } from "../../domain/schedule";

/** Schedule + next firing date, computed in main (renderer stays croner-free). */
export type WorkflowScheduleWithNext = WorkflowSchedule & {
  nextRunAt: string | null;
};

const computeNext = (s: WorkflowSchedule): string | null => {
  if (!s.enabled) return null;
  try {
    const job = new Cron(s.cron, s.timezone ? { timezone: s.timezone } : undefined);
    const next = job.nextRun();
    return next ? next.toISOString() : null;
  } catch {
    return null;
  }
};

type Deps = { registry: ScheduleRegistry };

export const makeListSchedules = ({ registry }: Deps) =>
  async (): Promise<ReadonlyArray<WorkflowScheduleWithNext>> => {
    const rows = await registry.list();
    return rows.map((s) => ({ ...s, nextRunAt: computeNext(s) }));
  };
