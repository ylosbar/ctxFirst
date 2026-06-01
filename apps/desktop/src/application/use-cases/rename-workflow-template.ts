import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeRenameWorkflowTemplate =
  (gateway: WorkflowGateway) => gateway.renameTemplate.bind(gateway);

export type RenameWorkflowTemplate = ReturnType<typeof makeRenameWorkflowTemplate>;
