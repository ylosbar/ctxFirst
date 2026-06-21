---
title: Sum types & résultats
description: Unions étiquetées avec OneOf<…>, les wrappers de résultat Success<T> / Error<E>, et comment branch.match dispatche une somme vers des sorties typées.
sidebar:
  order: 4
---

Un **sum type** modélise une valeur qui est l'une parmi plusieurs alternatives — « cet artifact est soit un `Url`, soit un `Markdown` ». CtxFirst les encode en `OneOf<…>`, avec `Success<T>` et `Error<E>` comme wrappers tout prêts pour le pattern résultat.

## `OneOf<A,B,…>`

Une somme discriminée de N variants, écrite `OneOf<A,B,C>` (sans espace). Son payload est un enregistrement étiqueté :

```json
{ "variantKind": "Url", "payload": { "value": "https://example.com" } }
```

- `variantKind` est l'un des kinds internes.
- `payload` correspond au descripteur de ce variant.

Contraintes, appliquées au parsing de la chaîne de kind :

- **2 à 6 variants** — une somme à un seul variant est juste le variant ; au-delà de six c'est refusé, pour borner la surface UI et le coût des vérifications de compatibilité.
- **Pas de doublons** — `OneOf<A,A>` se réduit à `A` et est refusé, pour faire remonter l'erreur de modélisation à la source.
- **Profondeur ≤ 4** — les variants peuvent eux-mêmes être paramétriques (`OneOf<List<Markdown>,Path>`), bornés par le plafond global d'imbrication.

L'ordre des variants n'a pas d'incidence sur l'identité : `OneOf<A,B>` et `OneOf<B,A>` sont le même type (leur [hash structurel](/fr/type-system/custom-kinds/#identité--le-hash-structurel) trie les variants).

## Produire et consommer une somme

Deux directions sont acceptées par la [compatibilité](/fr/type-system/compatibility/) ; une troisième est délibérément refusée.

- **Élargissement** — un producteur de `A` circule vers un port acceptant `OneOf<A,B>`, tant que `A` correspond à un variant (récursivement, donc les raffinements comptent : `String → OneOf<Url,Markdown>` marche quand `String` satisfait un variant).
- **Sous-ensemble** — un producteur de `OneOf<A>` circule vers un port acceptant `OneOf<A,B>` lorsque chaque variant produit est couvert par un variant accepté.
- **Extraction (refusée)** — un producteur de `OneOf<A,B>` ne circule **pas** vers un port acceptant `A` seul. Restreindre une somme à l'un de ses variants est une étape explicite — c'est le rôle de `branch.match`.

## Dispatcher avec `branch.match`

[Branch (match)](/fr/nodes/branch-match/) est l'éliminateur d'une somme. Il prend une entrée `OneOf<A,B,…>` et expose un port de sortie par variant ; à l'exécution il lit le `variantKind` du payload, sélectionne la sortie correspondante, et rematérialise le `payload` interne en un nouvel artifact du kind de ce variant. En aval, chaque branche est fortement typée comme le variant, donc l'extraction que le système de types refusait implicitement est désormais explicite et sûre.

## `Success<T>` et `Error<E>`

Sucre syntaxique pour les deux moitiés d'un résultat :

- `Success<T>` — l'enregistrement `{ variant: "Success", value: T }`.
- `Error<E>` — l'enregistrement `{ variant: "Error", value: E }`.

Ce sont des kinds paramétriques dédiés (implémentés comme `List<T>` au niveau de la grammaire) pour que le discriminant transite par les événements. Le type résultat idiomatique les compose sous une somme :

```text
OneOf<Success<Brief>,Error<String>>
```

Un producteur émet une moitié. Les payloads imbriquent l'étiquette de somme, l'étiquette de résultat et le payload du kind interne — concrètement, les deux branches ressemblent à :

```jsonc
// branche succès — variantKind est le wrapper Success<Brief>
{
  "variantKind": "Success<Brief>",
  "payload": { "variant": "Success", "value": { "title": "Auth rework", "summary": "Move sessions to JWT." } }
}

// branche erreur — Error<String>, dont le payload String interne est { value: … }
{
  "variantKind": "Error<String>",
  "payload": { "variant": "Error", "value": { "value": "rate limited" } }
}
```

Un `branch.match` en aval sépare le chemin de succès du chemin d'erreur, chacun typé comme son propre kind.

## Voir aussi

- [Kinds](/fr/type-system/kinds/) — la grammaire des kind-strings, dont `OneOf<…>`, `Success<T>`, `Error<E>`.
- [Compatibilité & câblage](/fr/type-system/compatibility/) — les règles d'élargissement/sous-ensemble qui gouvernent les sommes.
- [Branch (match)](/fr/nodes/branch-match/) — le node qui dispatche une somme vers des sorties typées.
- [Branch (JSON)](/fr/nodes/branch-json/) — router sur un champ JSONPath quand tu n'as pas de somme typée.
