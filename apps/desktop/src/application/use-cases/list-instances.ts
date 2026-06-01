import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeListInstances = (gateway: WorkflowGateway) => () =>
  gateway.listInstances();

export type ListInstances = ReturnType<typeof makeListInstances>;
