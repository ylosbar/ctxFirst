import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeSearchInstances =
  (gateway: WorkflowGateway) => (query: string) =>
    gateway.searchInstances(query);

export type SearchInstances = ReturnType<typeof makeSearchInstances>;
