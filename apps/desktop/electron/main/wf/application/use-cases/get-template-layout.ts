import type { TemplateLayout } from "@shared/wf/layout";
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import { parseTemplateRef } from "../../domain/ids";

type Deps = { templates: TemplateRegistry };

export type GetTemplateLayout = (templateRef: string) => Promise<TemplateLayout | null>;

export const makeGetTemplateLayout =
  ({ templates }: Deps): GetTemplateLayout =>
  async (templateRef) => {
    const { id, version } = parseTemplateRef(templateRef);
    return templates.getLayout(id, version);
  };
