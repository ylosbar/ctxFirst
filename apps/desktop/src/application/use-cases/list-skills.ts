import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeListSkills = (gateway: WorkflowGateway) => () =>
  gateway.listSkills();

export type ListSkills = ReturnType<typeof makeListSkills>;
