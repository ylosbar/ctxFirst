import type { WorkflowGateway } from "../ports/workflow-gateway";
import type { ArtifactKind } from "../../domain/workflow/types";

export const makeListStepKindSuggestions =
  (gateway: WorkflowGateway) => (inputKind: ArtifactKind) =>
    gateway.listStepKindSuggestions(inputKind);

export type ListStepKindSuggestions = ReturnType<
  typeof makeListStepKindSuggestions
>;
