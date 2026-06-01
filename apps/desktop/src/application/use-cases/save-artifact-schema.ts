import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeSaveArtifactSchema = (gateway: WorkflowGateway) =>
  gateway.saveArtifactSchema.bind(gateway);

export type SaveArtifactSchema = ReturnType<typeof makeSaveArtifactSchema>;
