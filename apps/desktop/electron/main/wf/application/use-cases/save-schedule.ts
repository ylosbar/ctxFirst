import type { ScheduleRegistry } from "../ports/outbound/schedule-registry";
import type { SchedulerService } from "../scheduler/scheduler-service";
import type {
  ScheduleDraft,
  WorkflowSchedule,
} from "../../domain/schedule";

type Deps = { registry: ScheduleRegistry; scheduler: SchedulerService };

export const makeSaveSchedule = ({ registry, scheduler }: Deps) =>
  async (draft: ScheduleDraft): Promise<WorkflowSchedule> => {
    const saved = await registry.save(draft);
    await scheduler.reload();
    return saved;
  };
