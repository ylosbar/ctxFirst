---
title: JSON Transform
description: Le node JSON Transform — extrait N projections JSONPath d'une entrée JSON, chacune émise sur son propre port de sortie.
---

`json.transform`

**JSON Transform** lit un artifact d'entrée arbitraire, le parse en JSON, puis évalue N expressions JSONPath. Chaque expression alimente un port de sortie nommé déclaré dans `config.transformations` ; le résultat d'une expression est toujours un tableau (même pour un unique scalaire, ou 0 valeur). Le node émet un seul outcome couvrant tous les ports.

Il échoue si l'entrée n'est pas un JSON valide (pas de repli sur une chaîne).

![Le node JSON Transform dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `json` | `*` | **Primaire.** Le JSON à projeter. Le `body` du payload est parsé s'il est présent (sinon le contenu brut) ; une clôture de bloc Markdown en tête est retirée d'abord. |
| Sortie | `<transformation.port>` | `Json` (ou `List<Json>` / `MarkdownList` si enveloppé) | Un port de sortie par entrée de `transformations`. Par défaut, le body `Json` est le tableau des matches. |

Quand une transformation pose `wrap: "list"`, le port émet à la place un artifact liste (un élément par match), prêt pour un [Loop Foreach](/fr/nodes/loop-foreach/) : `itemKind: "Json"` (défaut) donne `List<Json>`, `itemKind: "Markdown"` donne le `MarkdownList` legacy.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `transformations` | `{ port, expression, wrap?, itemKind? }[]` | `[{ port: "out", expression: "$" }]` | **Obligatoire**, au moins 1 entrée. Chaque entrée déclare un port de sortie et son JSONPath. |
| `transformations[].port` | `string` | — | Nom du port de sortie, doit matcher `^[a-zA-Z_][a-zA-Z0-9_-]*$` et être unique. **Obligatoire.** |
| `transformations[].expression` | `string` | — | Expression JSONPath non vide. **Obligatoire.** |
| `transformations[].wrap` | `"list"` | — | Si `"list"`, émet un artifact liste (un élément par match) au lieu d'un unique tableau `Json`. |
| `transformations[].itemKind` | `"Json"` \| `"Markdown"` | `"Json"` | Kind d'élément pour `wrap: "list"` : `Json` → `List<Json>`, `Markdown` → `MarkdownList`. |

## Comportement à l'exécution

1. Le runner lit et valide `config.transformations` (erreur si vide, port dupliqué, nom de port invalide, ou expression vide).
2. Il prend l'entrée `json` (erreur s'il n'y en a pas) et parse son body/contenu en JSON après avoir retiré une clôture de bloc en tête (erreur si JSON invalide).
3. Pour chaque transformation, il évalue le JSONPath (`wrap: true`, donc le résultat est toujours un tableau) ; une expression invalide lève et se traduit en échec de step.
4. Il stocke un artifact par port — `Json` (`format: "json"`, body = tableau des matches) par défaut, ou `List<Json>` / `MarkdownList` si enveloppé — avec les métadonnées `source: "json.transform"`, `port`, `expression`, `srcArtifactId`, `srcKind` (et `count` pour les listes), et émet un outcome `produced-many`.

## Exemple

Découper une liste JSON en Markdown par élément pour une boucle :

- `transformations` : `[{ port: "items", expression: "$.tasks[*]", wrap: "list", itemKind: "Markdown" }]`.
- Entrée `json` ← une sortie JSON amont.
- Sortie `items` (`MarkdownList`) → un [Loop Foreach](/fr/nodes/loop-foreach/) alimentant un assembleur de prompt [Concat Markdown](/fr/nodes/concat-markdown/).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Transform](/fr/nodes/transform-run/) — applique un parser sauvegardé plutôt qu'un JSONPath inline.
- [Loop Foreach](/fr/nodes/loop-foreach/) — consomme une sortie `wrap: "list"` élément par élément.
- [Branch JSON](/fr/nodes/branch-json/) — route sur un prédicat JSONPath plutôt que de projeter des valeurs.
