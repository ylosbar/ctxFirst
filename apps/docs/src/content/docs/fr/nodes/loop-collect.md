---
title: Collect
description: Le node Collect — agrège les sorties par itération d'un scope For each en un unique artifact liste.
---

`loop.collect`

**Collect** ferme le scope ouvert par un node [For each](/fr/nodes/loop-foreach/). Une fois que l'orchestrateur a exécuté les N itérations, il transmet à ce runner les N artifacts par itération dans l'ordre du tableau, et le runner les empile dans un unique artifact liste sur le port `items`.

[For each](/fr/nodes/loop-foreach/) et **Collect** fonctionnent en **paire** : le premier déploie, le second rassemble.

![Le node Collect dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `item` | `Markdown` (= `itemKind`) | Primaire, **entrée liste** (`isList`) : reçoit une valeur par itération du scope `loop.foreach` englobant. |
| Sortie | `items` | `MarkdownList` (selon `itemKind`) | Primaire. La liste agrégée de toutes les valeurs par itération. Avec un `itemKind` autre que `Markdown`/`Path`, le kind est `List<itemKind>`. |

Les kinds d'entrée/sortie suivent `config.itemKind` (défaut `Markdown`), de façon symétrique à `loop.foreach`. `Markdown` → `MarkdownList`, `Path` → `PathList`, tout autre kind `T` → `List<T>`.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `itemKind` | `ArtifactKind` | `"Markdown"` | Kind de chaque élément collecté. Détermine le kind du port d'entrée `item` et du kind liste de sortie `items`. Doit être un kind d'artifact connu. À aligner sur le `loop.foreach` apparié. |

## Comportement à l'exécution

1. Le runner lit `itemKind` (défaut `Markdown`) et en dérive le kind liste (`MarkdownList` / `PathList` / `List<T>`).
2. L'orchestrateur déclenche ce step seulement après que chaque itération du scope est terminée, en lui passant les N entrées `item` dans l'ordre du tableau.
3. Pour les kinds historiques (`Markdown` / `Path`), il extrait chaque scalaire (`body` / `path`) dans un payload `{ bodies }` / `{ paths }` ; sinon il empile chaque payload `T` complet sous `{ items }`.
4. Il stocke l'artifact liste sur `items` avec les métadonnées `source: "loop.collect"`, `itemKind` et `count`.

## Exemple

Agréger les résultats par itération en une seule liste :

- Entrée `item` (`Markdown`) ← la sortie par itération du sous-graphe à l'intérieur d'un scope [For each](/fr/nodes/loop-foreach/).
- Sortie `items` (`MarkdownList`) → câblée en aval (ex. vers un [Concat Markdown](/fr/nodes/concat-markdown/) pour assembler un rapport).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [For each](/fr/nodes/loop-foreach/) — ouvre le scope que ce node ferme ; les deux fonctionnent en paire.
- [Concat Markdown](/fr/nodes/concat-markdown/) — consommateur courant qui assemble les fragments collectés.
