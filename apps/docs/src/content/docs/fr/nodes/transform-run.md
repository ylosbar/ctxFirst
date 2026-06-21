---
title: Transform
description: Le node Transform — applique un parser/transform sauvegardé à l'artefact d'entrée et produit un nouvel artefact typé.
---

`transform.run`

**Transform** consomme l'artefact d'entrée sur le port `src`, applique un parser **sauvegardé** (résolu via `config.transformRef`) et persiste le résultat comme nouvel artefact typé `config.outputKind` (polymorphe). Aucun LLM, déterministe.

Il remplace le mécanisme implicite « parser-as-option » : chaque transformation devient un nœud explicite et réutilisable du graphe, visible en tant qu'artefact dans l'historique des runs.

![Le node Transform dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `src` | `*` | **Primaire.** L'artefact à transformer. Son contenu est parsé en JSON au mieux ; le texte brut est transmis tel quel s'il n'est pas du JSON. |
| Sortie | `out` | `config.outputKind` | Primaire. L'artefact transformé, validé contre `outputKind` par l'artifact store au moment du `put`. |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` | `"Markdown"` | Kind de l'artefact produit. **Obligatoire** — le runner échoue s'il est absent ou vide. |
| `transformRef` | `{ id, version }` | `{ id: "", version: "" }` | Pointeur vers un parser sauvegardé. **Obligatoire** — `id` et `version` doivent être des chaînes non vides. |

## Comportement à l'exécution

1. Le runner lit `config.outputKind` (erreur si absent/vide) et `config.transformRef` (erreur si `id` ou `version` manque).
2. Il vérifie que `parsers` et `parserRuntime` sont câblés dans `ctx.deps` (câblage côté composition-root) — erreur sinon.
3. Il prend l'entrée `src` (erreur s'il n'y en a pas) et résout le parser par sa ref (erreur si introuvable, `id@version`).
4. Il parse le contenu d'entrée en JSON au mieux (repli sur le texte brut en cas d'échec) et exécute le parser via `parserRuntime`.
5. Il stocke le résultat sous `outputKind` avec les métadonnées `source: "transform.run"`, `transformerId`, `transformerVersion`, `srcArtifactId` et `srcKind`. Un payload non conforme lève `ArtifactSchemaError`, traduite en `StepFailed { reason: "invalid-output" }`.

## Exemple

Parser un artefact JSON brut en un artefact métier typé :

- `transformRef` : `{ id, version }` d'un parser sauvegardé.
- `outputKind` : le kind cible (ex. `Markdown` ou un kind de plugin).
- Entrée `src` ← une sortie JSON amont ; sortie `out` → par ex. un node [Render Markdown](/fr/nodes/render-markdown/) pour le projeter, ou un assembleur de prompt [Concat Markdown](/fr/nodes/concat-markdown/).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [JSON Transform](/fr/nodes/json-transform/) — extrait des projections JSONPath inline (sans parser sauvegardé).
- [Render Markdown](/fr/nodes/render-markdown/) — projette l'artefact typé résultant en Markdown human-friendly.
- [Concat Markdown](/fr/nodes/concat-markdown/) — assemble le Markdown projeté dans un prompt.
