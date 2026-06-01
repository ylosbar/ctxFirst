import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeSaveParser = (gateway: WorkflowGateway) =>
  gateway.saveParser.bind(gateway);

export type SaveParser = ReturnType<typeof makeSaveParser>;
