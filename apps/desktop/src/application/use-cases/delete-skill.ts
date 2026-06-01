import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeDeleteSkill =
  (gateway: WorkflowGateway) => (ref: string) =>
    gateway.deleteSkill(ref);

export type DeleteSkill = ReturnType<typeof makeDeleteSkill>;
