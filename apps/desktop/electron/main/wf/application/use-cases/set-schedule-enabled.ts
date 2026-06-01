import type { ScheduleRegistry } from "../ports/outbound/schedule-registry";
import type { SchedulerService } from "../scheduler/scheduler-service";
import type { ScheduleId } from "../../domain/schedule";

type Deps = { registry: ScheduleRegistry; scheduler: SchedulerService };

export const makeSetScheduleEnabled = ({ registry, scheduler }: Deps) =>
  async (id: ScheduleId, enabled: boolean): Promise<void> => {
    await registry.setEnabled(id, enabled);
    await scheduler.reload();
  };
