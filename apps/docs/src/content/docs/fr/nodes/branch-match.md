---
title: Branch (match)
description: Le node Branch (match) — dispatch un artifact à type somme vers une sortie par variant de son kind OneOf.
---

`branch.match`

**Branch (match)** consomme un artifact à type somme de kind `OneOf<A,B,…>` et le « déballe » : il lit le discriminateur `variantKind` du payload et émet le payload interne, matérialisé en un nouvel artifact de ce variant, sur le port de sortie correspondant — un port par variant. Les ports non choisis ne sont jamais produits, et l'orchestrateur skippe en cascade les steps en aval qui ne sont accessibles que par eux.

C'est un kind avancé, de niveau moteur : il n'apparaît pas dans le sélecteur visuel de nodes. Les noms de ports de sortie sont encodés `out_<variant>` (p. ex. `out_Markdown`).

![Le node Branch (match) dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `in` | `OneOf<…>` | **Obligatoire**, primaire. L'artifact somme dont le kind est `config.targetKind`. Son payload doit être un objet non nul portant un `variantKind` (string) et un `payload` interne. |
| Sortie | `out_<variant>` | `<variant>` | Un port de sortie par variant extrait de `targetKind`. Émis quand le `variantKind` de l'entrée égale ce variant. |

Le payload interne est écrit via le store en un nouvel artifact du variant (`payloadFormat: json-v1`, validé contre le descripteur du variant) — l'aval consomme `A`, pas `OneOf<A,B>`.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `targetKind` | `string` | — | **Obligatoire.** Le kind `OneOf<…>` sur lequel dispatcher. Doit être un kind somme bien formé ; le runner lève une erreur s'il est absent, mal formé, ou pas un encodage OneOf. |

## Comportement à l'exécution

1. Le runner lit `config.targetKind` et le parse en ses variants (erreur s'il est absent, pas un `OneOf<…>`, ou mal formé).
2. Il lit l'artifact sur `in` (erreur si absent) et exige un payload objet non nul.
3. Il lit `payload.variantKind` (erreur si ce n'est pas une string) et `payload.payload` (la valeur interne).
4. Il vérifie que le variant observé fait partie des variants déclarés (erreur sinon).
5. Il écrit le payload interne en un nouvel artifact du variant et l'émet (`produced-on-port`) sur `out_<variant>`. Les steps câblés uniquement aux autres ports sont skippés en cascade.

## Exemple

Dispatcher un résultat `OneOf<Markdown,Json>` :

- `targetKind` : `OneOf<Markdown,Json>`.
- `in` ← un artifact somme dont le `variantKind` est `Markdown`.
- `out_Markdown` → un chemin consommateur de Markdown ; `out_Json` → un chemin consommateur de JSON.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Branch (JSON)](/fr/nodes/branch-json/) — routage par valeur pour le cas courant (le routeur visible dans le sélecteur).
- [Branch](/fr/nodes/branch-bool/) — routage par verdict Markdown.
