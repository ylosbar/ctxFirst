import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeListWorkflowTemplates =
  (gateway: WorkflowGateway) => () =>
    gateway.listTemplates();

export type ListWorkflowTemplates = ReturnType<typeof makeListWorkflowTemplates>;
