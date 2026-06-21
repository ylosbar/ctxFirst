---
title: Compatibilité & câblage
description: Les règles qui décident si un port de sortie peut se connecter à un port d'entrée — wildcard, match direct, covariance de liste, élargissement de somme, covariance de raffinement, égalité structurelle.
sidebar:
  order: 3
---

Quand tu tires une connexion entre deux ports, l'éditeur pose une seule question : **le port d'entrée du consommateur accepte-t-il le kind de sortie du producteur ?** Le même prédicat s'exécute au câblage dans l'éditeur et de nouveau à la validation dans le moteur — les garder identiques est la seule façon d'empêcher l'éditeur d'accepter un câble que le moteur refuserait ensuite.

Un port de **sortie** déclare un `kind` concret unique ; un port d'**entrée** déclare un tableau de `kinds` acceptés (un ou plusieurs kinds concrets, ou le wildcard `*`). Un câble est sûr en types quand le kind de sortie satisfait au moins une entrée de l'ensemble accepté en entrée, selon les règles ci-dessous.

```ts
// Producteur — un kind de sortie concret unique
{ name: "out", kind: "Url" }

// Consommateur — un tableau de kinds d'entrée acceptés
{ name: "spec", kinds: ["String"] }

// → accepté : Url raffine String, donc il circule (chemin 5, covariance de raffinement)
```

## Chemins d'acceptation

La vérification essaie chaque chemin dans l'ordre et s'arrête au premier match.

1. **Wildcard** — si le port d'entrée liste `*`, il accepte tout. (Voir [Kinds](/fr/type-system/kinds/#le-port-wildcard-).)
2. **Match direct** — le kind de sortie est égal à un kind accepté, en comparant l'orthographe d'origine et l'orthographe [canonique](/fr/type-system/kinds/#kinds-built-in) (donc `MarkdownList` correspond à `List<Markdown>`).
3. **Covariance de liste** — `List<X>` circule vers un port acceptant `List<Y>` **ssi** `X` circule vers un port acceptant `Y`. La covariance est récursive, donc `List<Url>` satisfait `List<String>` (car `Url` raffine `String`).
4. **Compatibilité de somme** — élargissement et sous-ensemble sur `OneOf<…>`. Détaillé dans [Sum types & résultats](/fr/type-system/sum-types/). L'inverse — extraire un variant d'une somme — est **refusé** ; cela demande un [Branch (match)](/fr/nodes/branch-match/) explicite.
5. **Covariance de raffinement** — un raffinement de `X` est accepté par un port acceptant `X`. La vérification remonte la chaîne `extends` (ex. `Url → String`), donc une sortie `Url` satisfait une entrée `String`. Bornée par un ensemble de visités pour rester sûre face à un registre corrompu.
6. **Égalité par hash structurel** — deux kinds dont les descripteurs se normalisent vers le même **hash structurel** sont interchangeables, quels que soient leur nom, leur version ou leur source. Un enregistrement `user:` et un enregistrement `plugin:` de même forme peuvent alimenter le même port. Voir [Kinds personnalisés](/fr/type-system/custom-kinds/#identité--le-hash-structurel).

Les chemins 1 à 4 ne nécessitent pas d'accès au registre (ils tournent dans les boucles chaudes de l'éditeur) ; les chemins 5 et 6 sont résolus contre le registre de kinds.

## Exemples

| Kind producteur | L'entrée accepte | Connecte ? | Pourquoi |
| --- | --- | --- | --- |
| `Markdown` | `["Markdown"]` | ✅ | Match direct. |
| `Markdown` | `["*"]` | ✅ | Wildcard. |
| `Url` | `["String"]` | ✅ | Covariance de raffinement (`Url` extends `String`). |
| `String` | `["Url"]` | ❌ | Une simple chaîne n'est pas une URL valide — la restriction n'est pas automatique. |
| `List<Url>` | `["List<String>"]` | ✅ | Covariance de liste sur le raffinement. |
| `List<Markdown>` | `["MarkdownList"]` | ✅ | Alias canonique. |
| `String` | `["OneOf<String,Number>"]` | ✅ | Élargissement de somme — correspond à un variant. |
| `OneOf<String,Number>` | `["String"]` | ❌ | Nécessite [Branch (match)](/fr/nodes/branch-match/) pour extraire un variant. |
| `user:Brief@v2` | `["plugin:acme:Brief@v1"]` | ✅ | Égalité par hash structurel (même forme). |

## Fan-in (entrées liste)

Un port peut être marqué **liste** — il accepte N transitions convergentes au lieu d'une, chacune vérifiée contre les mêmes kinds acceptés. [Concat Markdown](/fr/nodes/concat-markdown/) s'en sert pour rassembler de nombreux fragments `Markdown` en une seule entrée ordonnée. Une entrée non-liste prend un seul câble.

## Wires passthrough

Un node à effet de bord qui ne produit aucun artifact (ex. [Workspace Set](/fr/nodes/workspace-set/)) peut quand même être chaîné : le câble sortant est purement d'exécution et contourne entièrement la vérification de kind. L'entrée en aval est résolue depuis l'ancêtre producteur de données le plus proche à l'exécution. C'est ainsi que le chaînage de control-flow coexiste avec le flux de données typé.

## Voir aussi

- [Kinds](/fr/type-system/kinds/) — les kinds que ces règles comparent.
- [Sum types & résultats](/fr/type-system/sum-types/) — les règles d'élargissement/sous-ensemble du chemin 4.
- [Kinds personnalisés](/fr/type-system/custom-kinds/) — les raffinements (`extends`) et l'identité structurelle.
- [Câblage & variables](/fr/template-editor/wiring-variables/) — où tu traces les connexions que cette page valide.
