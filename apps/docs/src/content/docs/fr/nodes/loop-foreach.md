---
title: For each
description: Le node For each — itère sur un tableau et déploie le sous-graphe aval jusqu'au Collect correspondant.
---

`loop.foreach`

**For each** ouvre un scope d'itération sur une liste d'entrée. Pour chaque élément, il déploie le sous-graphe aval jusqu'au node [Collect](/fr/nodes/loop-collect/) correspondant, en exposant l'élément courant comme un unique artifact `item` à chaque itération.

Le runner lui-même ne matérialise pas les N itérations : il valide la forme du tableau d'entrée et le réémet comme un artifact « liste » pour que le run reste rejouable. C'est ensuite l'orchestrateur qui lit cette liste et pilote le fan-out par itération.

![Le node For each dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `items` | `MarkdownList` (selon `itemKind`) | **Optionnel** — câblez une liste à parcourir, ou renseignez `config.items`. Avec un `itemKind` autre que `Markdown`/`Path`, le kind est `List<itemKind>`. |
| Sortie | `item` | `Markdown` (= `itemKind`) | Primaire. L'élément courant, produit une fois par itération ; les nodes aval voient un `item` par passe. |

Les kinds d'entrée/sortie suivent `config.itemKind` (défaut `Markdown`). `Markdown` → `MarkdownList`, `Path` → `PathList`, tout autre kind `T` → `List<T>`.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `itemKind` | `ArtifactKind` | `"Markdown"` | Kind de chaque élément. Détermine le kind du port d'entrée `items` et du port de sortie `item`. Doit être un kind d'artifact connu. |
| `items` | `string[]` | `—` | Source codée en dur optionnelle. Si renseignée, chaque chaîne est sérialisée vers `itemKind` et l'entrée câblée `items` est ignorée. L'un de `items` (config) ou d'un input `items` câblé est **obligatoire**. |

## Comportement à l'exécution

1. Le runner lit `itemKind` (défaut `Markdown`) et en dérive le kind liste (`MarkdownList` / `PathList` / `List<T>`).
2. Il choisit la source : `config.items` (chaînes codées en dur) si renseigné, sinon l'input `items` câblé — erreur si aucun des deux n'est fourni.
3. Un input câblé doit correspondre au kind liste attendu, sinon il échoue.
4. Il parse le tableau en N éléments (forme historique `{ bodies }` / `{ paths }` pour `Markdown`/`Path`, forme canonique `{ items }` sinon) et réémet l'artifact liste complet avec les métadonnées `source: "loop.foreach"`, `itemKind` et `count`.
5. L'orchestrateur matérialise ensuite un `item` par élément, exécutant le sous-graphe N fois jusqu'au `loop.collect` correspondant.

## Exemple

Itérer sur une liste de fichiers et traiter chacun :

- `items` (`MarkdownList`) ← un artifact liste (ex. depuis un node amont), ou renseignez `config.items` avec une liste fixe.
- Sortie `item` (`Markdown`) → câblée sur le sous-graphe par itération (ex. un [Claude Code Invoke](/fr/nodes/claude-code-invoke/)).
- Refermez le scope avec un node [Collect](/fr/nodes/loop-collect/) en aval pour agréger les résultats de chaque itération.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Collect](/fr/nodes/loop-collect/) — referme le scope ouvert par ce node ; les deux fonctionnent en paire.
- [Concat Markdown](/fr/nodes/concat-markdown/) — assemble les fragments par itération avant ou après la boucle.
