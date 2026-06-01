import type { WorkflowGateway } from "../ports/workflow-gateway";
import type { ArtifactSchemaRefView } from "../../domain/workflow/types";

export const makeDeleteArtifactSchema =
  (gateway: WorkflowGateway) => (ref: ArtifactSchemaRefView) =>
    gateway.deleteArtifactSchema(ref);

export type DeleteArtifactSchema = ReturnType<typeof makeDeleteArtifactSchema>;
