import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeListNodeSpecs =
  (gateway: WorkflowGateway) => () =>
    gateway.listNodeSpecs();

export type ListNodeSpecs = ReturnType<typeof makeListNodeSpecs>;
