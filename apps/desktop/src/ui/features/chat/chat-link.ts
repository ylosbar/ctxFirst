import { workbenchRegistry } from "../../workbench/registry";

export type ChatLink =
  | { readonly kind: "internal"; readonly uri: string }
  | { readonly kind: "external"; readonly href: string | undefined };

// Un lien est "interne" ssi son schéma correspond à un type d'éditeur enregistré.
// On exclut explicitement les URI de création (`*://new`) pour éviter qu'un clic
// crée un draft (cf. spec §2.2).
export const classifyChatLink = (href: string | undefined): ChatLink => {
  if (href && !href.endsWith("://new") && workbenchRegistry.editorTypeFor(href) != null) {
    return { kind: "internal", uri: href };
  }
  return { kind: "external", href };
};
