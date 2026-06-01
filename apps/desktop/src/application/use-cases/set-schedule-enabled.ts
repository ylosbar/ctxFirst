import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeSetScheduleEnabled =
  (gateway: WorkflowGateway) => (id: string, enabled: boolean) =>
    gateway.setScheduleEnabled(id, enabled);

export type SetScheduleEnabled = ReturnType<typeof makeSetScheduleEnabled>;
