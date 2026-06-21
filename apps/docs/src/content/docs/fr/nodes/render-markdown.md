---
title: Render Markdown
description: Le node Render Markdown — projette n'importe quel artifact typé en Markdown human-friendly via la projection de son kind.
---

`render.markdown`

**Render Markdown** projette n'importe quel artifact typé (kind wildcard) en `Markdown` human-friendly via la projection Markdown de son kind. La projection est résolue côté main : une fonction (built-in / plugin), un gabarit `{{champ}}` (kinds `user`), un champ `renderedMarkdown` embarqué, une enveloppe texte `body`, ou — dernier recours — un bloc JSON pretty-printé. Il ne lève jamais.

C'est le pont explicite et typé vers [Concat Markdown](/fr/nodes/concat-markdown/) : sa sortie `Markdown` satisfait l'acceptation de port sans relâcher le contrat strict ni introduire de coercion implicite. Ce node est de niveau moteur et n'apparaît pas dans le sélecteur visuel, mais s'utilise comme n'importe quel autre node.

![Le node Render Markdown dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `in` | `*` | **Primaire.** L'artifact typé à projeter. En mode dégradé (`payload === null`), le contenu brut est parsé en JSON au mieux, avec repli sur une enveloppe `body`. |
| Sortie | `out` | `Markdown` | Primaire. Le Markdown rendu. |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| — | — | — | Ce node ne prend aucune configuration. |

## Comportement à l'exécution

1. Le runner prend l'entrée `in` (erreur s'il n'y en a pas).
2. Il résout le descripteur du kind via `ctx.deps.artifactSchemas` (un kind inconnu est toléré — le renderer retombe sur sa chaîne générique).
3. Il appelle `renderArtifactMarkdown` avec le `markdownProjection` du descripteur (ou `null`) et le payload d'entrée (parsé depuis le contenu en mode dégradé).
4. Il stocke le `Markdown` résultant sur `out` avec les métadonnées `source: "render.markdown"`, `srcKind` et `srcArtifactId`.

## Exemple

Projeter un artifact plugin/métier en Markdown avant d'assembler un prompt :

- Entrée `in` ← un artifact typé (ex. la sortie d'un [Transform](/fr/nodes/transform-run/)).
- Sortie `out` (`Markdown`) → un fragment [Concat Markdown](/fr/nodes/concat-markdown/) ou un port de variable [Markdown Template](/fr/nodes/markdown-template/).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Concat Markdown](/fr/nodes/concat-markdown/) — consomme le Markdown rendu comme une entrée `Markdown` stricte.
- [Transform](/fr/nodes/transform-run/) — produit l'artifact typé que ce node projette.
- [Markdown Template](/fr/nodes/markdown-template/) — interpole le Markdown rendu dans un gabarit paramétré.
