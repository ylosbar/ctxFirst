import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeDeleteInstance =
  (gateway: WorkflowGateway) => (instanceId: string) =>
    gateway.deleteInstance(instanceId);

export type DeleteInstance = ReturnType<typeof makeDeleteInstance>;
