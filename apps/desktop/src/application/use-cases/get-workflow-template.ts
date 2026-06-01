import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeGetWorkflowTemplate =
  (gateway: WorkflowGateway) => (templateRef: string) =>
    gateway.getTemplate(templateRef);

export type GetWorkflowTemplate = ReturnType<typeof makeGetWorkflowTemplate>;
