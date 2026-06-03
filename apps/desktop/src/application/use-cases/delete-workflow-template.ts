import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeDeleteWorkflowTemplate =
  (gateway: WorkflowGateway) => (templateRef: string) =>
    gateway.deleteTemplate(templateRef);

export type DeleteWorkflowTemplate = ReturnType<typeof makeDeleteWorkflowTemplate>;
