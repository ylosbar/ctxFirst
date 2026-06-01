/**
 * Read-only use-case: list every registered workflow template.
 * Consumed by the /templates page to render the catalogue.
 */
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import type { WorkflowTemplate } from "../../domain/template";

type Deps = { templates: TemplateRegistry };

export type ListTemplates = () => Promise<ReadonlyArray<WorkflowTemplate>>;

export const makeListTemplates =
  ({ templates }: Deps): ListTemplates =>
  () =>
    templates.list();
