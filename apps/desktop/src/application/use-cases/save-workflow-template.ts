import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeSaveWorkflowTemplate =
  (gateway: WorkflowGateway) => gateway.saveTemplate.bind(gateway);

export type SaveWorkflowTemplate = ReturnType<typeof makeSaveWorkflowTemplate>;
