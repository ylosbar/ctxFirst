import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeListSchedules = (gateway: WorkflowGateway) => () =>
  gateway.listSchedules();

export type ListSchedules = ReturnType<typeof makeListSchedules>;
