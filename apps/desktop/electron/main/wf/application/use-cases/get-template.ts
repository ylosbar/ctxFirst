/**
 * Read-only use-case: resolve a workflow template by its canonical
 * `name@version` reference. Used by the UI to render the workflow graph.
 */
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import type { WorkflowTemplate } from "../../domain/template";

type Deps = { templates: TemplateRegistry };

export type GetTemplate = (ref: string) => Promise<WorkflowTemplate>;

export const makeGetTemplate =
  ({ templates }: Deps): GetTemplate =>
  (ref) =>
    templates.resolveRef(ref);
