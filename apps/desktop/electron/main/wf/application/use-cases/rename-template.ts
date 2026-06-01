import type { TemplateRegistry } from "../ports/outbound/template-registry";
import { asTemplateId, asTemplateVersion } from "../../domain/ids";

type Deps = { templates: TemplateRegistry };

type Input = { templateRef: string; newName: string };

export type RenameTemplate = (input: Input) => Promise<void>;

export const makeRenameTemplate =
  ({ templates }: Deps): RenameTemplate =>
  async ({ templateRef, newName }) => {
    const name = newName.trim();
    if (!name) throw new Error("template name is required");
    const [idPart, versionPart] = templateRef.split("@");
    if (!idPart || !versionPart) {
      throw new Error(`invalid template ref: ${templateRef}`);
    }
    await templates.rename(asTemplateId(idPart), asTemplateVersion(versionPart), name);
  };
