import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeDeleteSchedule = (gateway: WorkflowGateway) => (id: string) =>
  gateway.deleteSchedule(id);

export type DeleteSchedule = ReturnType<typeof makeDeleteSchedule>;
