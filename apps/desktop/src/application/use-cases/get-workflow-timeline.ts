import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeGetWorkflowTimeline =
  (gateway: WorkflowGateway) => (instanceId: string) =>
    gateway.getTimeline(instanceId);

export type GetWorkflowTimeline = ReturnType<typeof makeGetWorkflowTimeline>;
