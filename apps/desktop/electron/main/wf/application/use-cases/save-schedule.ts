import type { ScheduleRegistry } from "../ports/outbound/schedule-registry";
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import type { SchedulerService } from "../scheduler/scheduler-service";
import type {
  ScheduleDraft,
  WorkflowSchedule,
} from "../../domain/schedule";

type Deps = {
  registry: ScheduleRegistry;
  templates: TemplateRegistry;
  scheduler: SchedulerService;
};

export const makeSaveSchedule = ({ registry, templates, scheduler }: Deps) =>
  async (draft: ScheduleDraft): Promise<WorkflowSchedule> => {
    // A schedule freezes its payload (seeds, cwd) and replays it on every tick —
    // it cannot prompt for a launch input. A template with a *required* launch
    // input (promptAtLaunch with no defaultValue) is therefore not schedulable:
    // `start-instance` would throw on the empty slot at every tick. This mirrors
    // that required check (root launch has no caller to seed even a role:"input"
    // variable, so role is not exempted here). Refuse at save so the author gives
    // it a default — the run then uses the default.
    // (launch-input-variables.md §P3 / §Risques.)
    const tpl = await templates.resolveRef(draft.templateRef);
    const required = tpl.variables.filter(
      (v) => v.promptAtLaunch === true && v.defaultValue === undefined,
    );
    if (required.length > 0) {
      throw new Error(
        `template ${tpl.id}@${tpl.version} cannot be scheduled: it has required launch input(s) ` +
          `[${required.map((v) => v.name).join(", ")}] with no default value — give each a default to make it schedulable`,
      );
    }
    const saved = await registry.save(draft);
    await scheduler.reload();
    return saved;
  };
