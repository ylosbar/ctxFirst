import type { TemplateLayout } from "@shared/wf/layout";
import type { WorkflowGateway } from "../ports/workflow-gateway";

export const makeSaveTemplateLayout =
  (gateway: WorkflowGateway) =>
  (templateRef: string, layout: TemplateLayout) =>
    gateway.saveTemplateLayout(templateRef, layout);

export type SaveTemplateLayout = ReturnType<typeof makeSaveTemplateLayout>;
