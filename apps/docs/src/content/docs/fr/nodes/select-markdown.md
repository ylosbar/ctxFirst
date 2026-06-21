---
title: Select (Markdown)
description: Le node Select (Markdown) — injecte conditionnellement un fragment Markdown selon un flag JSON, en produisant toujours une sortie.
---

`select.markdown`

**Select (Markdown)** est un injecteur conditionnel, pas un routeur. Il lit un flag booléen via JSONPath (`config.path`) dans son entrée `cond`, puis émet sur l'unique port `out` le `body` de l'entrée `value` si le flag est vrai, ou du Markdown vide sinon. Il produit **toujours** — aucun port mort, rien à reconverger en aval, contrairement à un diamant `branch.json`.

Attention au coût eager : l'amont qui produit `value` s'exécute toujours, même quand le flag est faux. Pour une `value` coûteuse (réseau, LLM), préférer un vrai [Branch (JSON)](/fr/nodes/branch-json/) qui skippe la branche inutilisée.

![Le node Select (Markdown) dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `cond` | `*` | **Obligatoire**, primaire. Parsé en JSON (un éventuel code fence en tête est retiré) ; `path` y lit le flag. |
| Entrée | `value` | `Markdown`, `Json` | **Optionnel.** Son `body` est injecté quand le flag est vrai. Sans lui (ou flag faux), la sortie est du Markdown vide. |
| Sortie | `out` | `Markdown` | Primaire. Le fragment injecté, ou du Markdown vide. Toujours produit. |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `path` | `string` | `$.flag` | **Obligatoire.** JSONPath non vide dans le JSON de `cond`. Doit matcher exactement une valeur scalaire. |

## Comportement à l'exécution

1. Le runner valide `config.path` (non vide) — erreur sinon.
2. Il lit `cond`, retire un éventuel code fence en tête, et fait un `JSON.parse` (erreur si JSON invalide).
3. Il évalue `path` (erreur sauf si exactement une correspondance) et la coerce en booléen : `true` / nombre non nul / chaîne non vide ≠ `"false"` → vrai ; `false` / `null` / `0` / `""` / `"false"` → faux ; objet/tableau lève une erreur.
4. Si vrai et que `value` est câblé, il prend le `body` de `value` ; sinon le body est vide.
5. Il sérialise le body en `Markdown` et produit un nouvel artifact sur `out` (`source: "select.markdown"`, `condPath`, `injected`).

## Exemple

Ajouter conditionnellement une section à un prompt :

- `cond` (`Json`) ← un payload du type `{ "flag": true }`.
- `path` : `$.flag`.
- `value` (`Markdown`) ← la section optionnelle à injecter.
- `out` → câblé dans un fragment de [Concat Markdown](/fr/nodes/concat-markdown/) ; vide quand le flag est faux.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Branch (JSON)](/fr/nodes/branch-json/) — vrai branchement (skippe la branche inutilisée) quand `value` est coûteux.
- [Concat Markdown](/fr/nodes/concat-markdown/) — consommateur courant du fragment injecté.
