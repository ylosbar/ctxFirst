import type { TemplateRegistry } from "../ports/outbound/template-registry";
import { asTemplateId, asTemplateVersion } from "../../domain/ids";

type Deps = { templates: TemplateRegistry };

export type DeleteTemplate = (templateRef: string) => Promise<void>;

export const makeDeleteTemplate =
  ({ templates }: Deps): DeleteTemplate =>
  async (templateRef) => {
    const [idPart, versionPart] = templateRef.split("@");
    if (!idPart || !versionPart) {
      throw new Error(`invalid template ref: ${templateRef}`);
    }
    await templates.remove(asTemplateId(idPart), asTemplateVersion(versionPart));
  };
