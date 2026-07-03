import type { TemplateRegistry } from "../ports/outbound/template-registry";
import { parseTemplateRef } from "../../domain/ids";

type Deps = { templates: TemplateRegistry };

export type DeleteTemplate = (templateRef: string) => Promise<void>;

export const makeDeleteTemplate =
  ({ templates }: Deps): DeleteTemplate =>
  async (templateRef) => {
    const { id, version } = parseTemplateRef(templateRef);
    await templates.remove(id, version);
  };
