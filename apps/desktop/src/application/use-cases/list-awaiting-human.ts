import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeListAwaitingHuman = (gateway: WorkflowGateway) => () =>
  gateway.listAwaitingHuman();

export type ListAwaitingHuman = ReturnType<typeof makeListAwaitingHuman>;
