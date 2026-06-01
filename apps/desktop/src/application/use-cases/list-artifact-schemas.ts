import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeListArtifactSchemas = (gateway: WorkflowGateway) => () =>
  gateway.listArtifactSchemas();

export type ListArtifactSchemas = ReturnType<typeof makeListArtifactSchemas>;
