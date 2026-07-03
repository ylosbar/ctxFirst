import type { TemplateRegistry } from "../ports/outbound/template-registry";
import { parseTemplateRef } from "../../domain/ids";

type Deps = { templates: TemplateRegistry };

type Input = { templateRef: string; newName: string };

export type RenameTemplate = (input: Input) => Promise<void>;

export const makeRenameTemplate =
  ({ templates }: Deps): RenameTemplate =>
  async ({ templateRef, newName }) => {
    const name = newName.trim();
    if (!name) throw new Error("template name is required");
    const { id, version } = parseTemplateRef(templateRef);
    await templates.rename(id, version, name);
  };
