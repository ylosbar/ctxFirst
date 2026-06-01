import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeGetArtifact =
  (gateway: WorkflowGateway) => (artifactId: string) =>
    gateway.getArtifact(artifactId);

export type GetArtifact = ReturnType<typeof makeGetArtifact>;
