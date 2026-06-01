import { beforeAll, describe, expect, it } from "vitest";
import { workbenchRegistry } from "../../../workbench/registry";
import { classifyChatLink } from "../chat-link";

// `classifyChatLink` délègue la reconnaissance du schéma au registre workbench.
// En test unitaire, les modules de contributions des features ne sont pas
// chargés, donc le registre est vide : on enregistre des types d'éditeur stub
// pour les schémas qui nous intéressent (un schéma suffit, le rendu importe peu).
beforeAll(() => {
  for (const scheme of ["template", "run", "skill", "artifact-schema", "review"]) {
    workbenchRegistry.registerEditorType({
      id: `${scheme}.editor`,
      scheme,
      title: () => scheme,
      render: () => null,
    });
  }
});

describe("classifyChatLink", () => {
  it.each([
    "template://x@1",
    "run://abc",
    "run://abc?step=s",
    "skill://s@2",
    "artifact-schema://t@1",
    "review://r?exec=e",
  ])("classe un URI d'éditeur connu comme interne : %s", (href) => {
    expect(classifyChatLink(href)).toEqual({ kind: "internal", uri: href });
  });

  it.each(["https://example.com", "mailto:a@b.c", ""])(
    "classe un lien non-éditeur comme externe : %s",
    (href) => {
      expect(classifyChatLink(href)).toEqual({ kind: "external", href });
    },
  );

  it("classe un href absent comme externe", () => {
    expect(classifyChatLink(undefined)).toEqual({ kind: "external", href: undefined });
  });

  it.each(["template://new", "skill://new", "artifact-schema://new"])(
    "exclut les URI de création (rendu externe inerte) : %s",
    (href) => {
      expect(classifyChatLink(href)).toEqual({ kind: "external", href });
    },
  );

  it("classe un schéma inconnu comme externe", () => {
    expect(classifyChatLink("foo://bar")).toEqual({ kind: "external", href: "foo://bar" });
  });
});
