import type { WorkflowGateway } from "../ports/workflow-gateway";
import type { ArtifactSchemaRefView } from "../../domain/workflow/types";

export const makeListParsers =
  (gateway: WorkflowGateway) => (forType?: ArtifactSchemaRefView) =>
    gateway.listParsers(forType);

export type ListParsers = ReturnType<typeof makeListParsers>;
