import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeSaveSkill =
  (gateway: WorkflowGateway) => gateway.saveSkill.bind(gateway);

export type SaveSkill = ReturnType<typeof makeSaveSkill>;
