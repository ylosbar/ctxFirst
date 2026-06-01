import type { TemplateLayout } from "@shared/wf/layout";
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import { asTemplateId, asTemplateVersion } from "../../domain/ids";

type Deps = { templates: TemplateRegistry };

export type GetTemplateLayout = (templateRef: string) => Promise<TemplateLayout | null>;

export const makeGetTemplateLayout =
  ({ templates }: Deps): GetTemplateLayout =>
  async (templateRef) => {
    const [idPart, versionPart] = templateRef.split("@");
    if (!idPart || !versionPart) {
      throw new Error(`invalid template ref: ${templateRef}`);
    }
    return templates.getLayout(asTemplateId(idPart), asTemplateVersion(versionPart));
  };
