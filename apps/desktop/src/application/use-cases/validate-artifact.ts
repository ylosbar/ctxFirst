import type { ArtifactKind } from "../../domain/workflow/types";
import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeValidateArtifact =
  (gateway: WorkflowGateway) =>
  (kind: ArtifactKind, content: string) =>
    gateway.validateArtifact(kind, content);

export type ValidateArtifact = ReturnType<typeof makeValidateArtifact>;
