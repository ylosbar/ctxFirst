import type { WorkflowGateway } from "../ports/workflow-gateway";

type Input = {
  instanceId: string;
  stepExecId: string;
  configOverride?: Record<string, unknown>;
};

export const makeRequestRerun = (gateway: WorkflowGateway) => (input: Input) =>
  gateway.rerunFromNode(input);

export type RequestRerun = ReturnType<typeof makeRequestRerun>;
