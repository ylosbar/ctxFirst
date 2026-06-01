import { Cron } from "croner";
import type { ClockPort } from "../ports/outbound/clock";
import type { LoggerPort } from "../ports/outbound/logger";
import type { ScheduleRegistry } from "../ports/outbound/schedule-registry";
import type {
  ScheduleId,
  WorkflowSchedule,
} from "../../domain/schedule";
import type { StartInstance } from "../use-cases/start-instance";

type Deps = {
  registry: ScheduleRegistry;
  startInstance: StartInstance;
  clock: ClockPort;
  logger: LoggerPort;
};

export type SchedulerService = {
  /** Catch-up pass + arms each enabled schedule. Call ONCE at app boot. */
  start(): Promise<void>;
  /** Disarm everything and re-arm from DB. NO catch-up — for CRUD mutations. */
  reload(): Promise<void>;
  /** Tear down every armed timer. Call on `will-quit`. */
  stop(): void;
};

/**
 * Compute the most recent cron occurrence at or before `now`.
 *
 * `croner.previousRuns(1, reference)` returns the most recent scheduled
 * occurrence strictly before `reference`. We pass `now + 1 second` so an
 * occurrence at exactly `now` is included, matching the user expectation
 * that "the 09:00 tick just happened" counts as due when comparing at 09:00.
 */
const lastDueAtOrBefore = (
  cron: string,
  timezone: string | undefined,
  now: Date,
): Date | null => {
  const job = new Cron(cron, timezone ? { timezone } : undefined);
  const reference = new Date(now.getTime() + 1000);
  const runs = job.previousRuns(1, reference);
  return runs.length > 0 ? runs[0] : null;
};

export const createSchedulerService = (deps: Deps): SchedulerService => {
  const jobs = new Map<ScheduleId, Cron>();

  const fire = async (schedule: WorkflowSchedule): Promise<void> => {
    try {
      const { instanceId } = await deps.startInstance({
        templateRef: schedule.templateRef,
        seeds: schedule.seeds,
        ...(schedule.cwd ? { cwd: schedule.cwd } : {}),
        ...(schedule.channelId ? { channelId: schedule.channelId } : {}),
      });
      await deps.registry.recordRun(schedule.id, {
        at: deps.clock.now(),
        instanceId,
        status: "ok",
      });
      deps.logger.info(
        `[wf:scheduler] fired ${schedule.id} → instance=${instanceId}`,
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await deps.registry.recordRun(schedule.id, {
        at: deps.clock.now(),
        status: "error",
        error,
      });
      deps.logger.error(
        `[wf:scheduler] schedule ${schedule.id} failed: ${error}`,
      );
    }
  };

  const arm = (schedule: WorkflowSchedule): void => {
    try {
      const job = new Cron(
        schedule.cron,
        schedule.timezone ? { timezone: schedule.timezone } : undefined,
        () => {
          void fire(schedule);
        },
      );
      jobs.set(schedule.id, job);
    } catch (err) {
      deps.logger.error(
        `[wf:scheduler] cannot arm schedule ${schedule.id} (cron="${schedule.cron}"): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const disarmAll = (): void => {
    for (const job of jobs.values()) job.stop();
    jobs.clear();
  };

  const maybeCatchUp = async (schedule: WorkflowSchedule): Promise<void> => {
    // Borne basse : on ne rattrape jamais une échéance antérieure à la
    // dernière exécution ou, à défaut, à la création de la schedule.
    const referenceIso = schedule.lastRunAt ?? schedule.createdAt;
    const reference = new Date(referenceIso);
    const lastDue = lastDueAtOrBefore(
      schedule.cron,
      schedule.timezone,
      new Date(deps.clock.now()),
    );
    if (!lastDue) return;
    if (lastDue.getTime() <= reference.getTime()) return;
    deps.logger.info(
      `[wf:scheduler] catch-up ${schedule.id} (lastDue=${lastDue.toISOString()} > ref=${referenceIso})`,
    );
    await fire(schedule);
  };

  return {
    async start() {
      const schedules = await deps.registry.listAllEnabled();
      for (const schedule of schedules) {
        try {
          await maybeCatchUp(schedule);
        } catch (err) {
          deps.logger.error(
            `[wf:scheduler] catch-up failed for ${schedule.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        arm(schedule);
      }
      deps.logger.info(
        `[wf:scheduler] started · armed=${jobs.size}/${schedules.length}`,
      );
    },
    async reload() {
      disarmAll();
      const schedules = await deps.registry.listAllEnabled();
      for (const schedule of schedules) arm(schedule);
      deps.logger.info(
        `[wf:scheduler] reloaded · armed=${jobs.size}/${schedules.length}`,
      );
    },
    stop() {
      disarmAll();
    },
  };
};
