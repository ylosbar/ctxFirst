import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeValidateStep =
  (gateway: WorkflowGateway) =>
  (instanceId: string, stepExecId: string) =>
    gateway.submitDecision({ instanceId, stepExecId });

export type ValidateStep = ReturnType<typeof makeValidateStep>;
