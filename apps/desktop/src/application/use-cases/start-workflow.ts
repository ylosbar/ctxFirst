import type { WorkflowGateway } from "../ports/workflow-gateway";
import type { ArtifactKind } from "../../domain/workflow/types";

export type StartWorkflowInput = {
  templateRef: string;
  seeds: ReadonlyArray<{ kind: ArtifactKind; content: string }>;
  /** Optional initial working directory for native side-effects of the run. */
  cwd?: string;
  /**
   * Values for the template's `promptAtLaunch` variables, collected by the
   * run-launch dialog (`launch-input-variables.md` §P2/§P3). Each `name`
   * references a declared, `promptAtLaunch` variable; `content` overrides its
   * `defaultValue` at start.
   */
  variableValues?: ReadonlyArray<{ name: string; content: string }>;
};

export const makeStartWorkflow =
  (gateway: WorkflowGateway) => (input: StartWorkflowInput) =>
    gateway.startInstance(input);

export type StartWorkflow = ReturnType<typeof makeStartWorkflow>;
