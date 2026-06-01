import type { WorkflowGateway } from "../ports/workflow-gateway";
import type { ScheduleDraftView } from "../../domain/workflow/types";

export const makeSaveSchedule =
  (gateway: WorkflowGateway) => (draft: ScheduleDraftView) =>
    gateway.saveSchedule(draft);

export type SaveSchedule = ReturnType<typeof makeSaveSchedule>;
