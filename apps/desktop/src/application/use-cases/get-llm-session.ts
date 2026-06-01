import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeGetLlmSession =
  (gateway: WorkflowGateway) => (stepExecId: string) =>
    gateway.getLlmSession(stepExecId);

export type GetLlmSession = ReturnType<typeof makeGetLlmSession>;
