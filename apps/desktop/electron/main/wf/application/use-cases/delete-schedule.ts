import type { ScheduleRegistry } from "../ports/outbound/schedule-registry";
import type { SchedulerService } from "../scheduler/scheduler-service";
import type { ScheduleId } from "../../domain/schedule";

type Deps = { registry: ScheduleRegistry; scheduler: SchedulerService };

export const makeDeleteSchedule = ({ registry, scheduler }: Deps) =>
  async (id: ScheduleId): Promise<void> => {
    await registry.delete(id);
    await scheduler.reload();
  };
