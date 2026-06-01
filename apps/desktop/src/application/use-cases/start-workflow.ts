import type { WorkflowGateway } from "../ports/workflow-gateway";
import type { ArtifactKind } from "../../domain/workflow/types";

export type StartWorkflowInput = {
  templateRef: string;
  seeds: ReadonlyArray<{ kind: ArtifactKind; content: string }>;
  /** Optional initial working directory for native side-effects of the run. */
  cwd?: string;
};

export const makeStartWorkflow =
  (gateway: WorkflowGateway) => (input: StartWorkflowInput) =>
    gateway.startInstance(input);

export type StartWorkflow = ReturnType<typeof makeStartWorkflow>;
