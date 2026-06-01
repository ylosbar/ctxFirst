import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeGetTemplateLayout =
  (gateway: WorkflowGateway) => (templateRef: string) =>
    gateway.getTemplateLayout(templateRef);

export type GetTemplateLayout = ReturnType<typeof makeGetTemplateLayout>;
