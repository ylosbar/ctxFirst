import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeGetRunTokenUsage =
  (gateway: WorkflowGateway) => (instanceId: string) =>
    gateway.getRunTokenUsage(instanceId);

export type GetRunTokenUsage = ReturnType<typeof makeGetRunTokenUsage>;
