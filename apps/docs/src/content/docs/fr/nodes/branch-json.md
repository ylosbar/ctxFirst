---
title: Branch (JSON)
description: Le node Branch (JSON) — route le workflow vers l'une de N branches selon un champ JSON lu dans l'entrée.
---

`branch.json`

**Branch (JSON)** parse son entrée en JSON, évalue un JSONPath (`config.path`), coerce le scalaire extrait en chaîne, et route l'exécution vers exactement un des N ports de sortie — un port par entrée de `config.cases`. Il comble le trou entre [Branch](/fr/nodes/branch-bool/) (qui exige un verdict Markdown) et [JSON Transform](/fr/nodes/json-transform/) (qui ré-émet toujours un tableau JSON).

La décision est lue depuis l'artifact déjà persisté — déterministe, sans LLM ni réseau. Le port correspondant ré-émet l'artifact d'entrée tel quel ; les autres ports ne sont jamais produits, et l'orchestrateur skippe en cascade les steps en aval qui ne sont accessibles que par eux.

![Le node Branch (JSON) dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `json` | `*` | **Obligatoire**, primaire. Parsé en JSON (un éventuel code fence en tête est retiré) ; pour les kinds enveloppe, c'est la chaîne `payload.body` qui est parsée, sinon le `content` brut. |
| Sortie | `<cas>` | `inputKind` | Un port de sortie par entrée de `config.cases`. Émis quand la valeur en `path` égale ce label. |

L'artifact d'entrée est ré-émis tel quel sur le port choisi (aucun nouvel octet écrit). Les sorties sont de kind `Json` par défaut, sauf si `inputKind` le surcharge.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `path` | `string` | `$.flag` | **Obligatoire.** JSONPath non vide dans le JSON d'entrée. Doit matcher exactement une valeur scalaire. |
| `cases` | `string[]` | `["true", "false"]` | **Obligatoire.** ≥2 labels uniques, chacun respectant `/^[a-zA-Z_][a-zA-Z0-9_-]*$/` (servent de noms de ports). Chacun devient un port de sortie. |
| `inputKind` | `string` | `Json` | Kind d'artifact déclaré sur les ports de sortie (kind de passthrough). |

## Comportement à l'exécution

1. Le runner valide `config.path` (non vide) et `config.cases` (≥2 labels uniques et sûrs comme noms de ports) — erreur sinon.
2. Il lit l'entrée sur `json`, retire un éventuel code fence en tête, et fait un `JSON.parse` (erreur si JSON invalide).
3. Il évalue `path` sur les données parsées (erreur si 0 ou plus d'une correspondance).
4. Il coerce l'unique correspondance en chaîne : booléens/nombres via `String(...)`, chaînes telles quelles, `null` → `"null"` ; un objet/tableau lève une erreur (non scalaire).
5. Il cherche le cas égal à cette chaîne (erreur si aucun ne matche).
6. Il charge la meta de l'artifact d'entrée et le ré-émet tel quel (`produced-on-port`) sur le port correspondant. Les steps câblés uniquement aux autres ports sont skippés en cascade.

## Exemple

Router sur un flag JSON issu d'un transform amont :

- `json` (`Json`) ← un payload du type `{ "flag": "approved" }`.
- `path` : `$.flag`, `cases` : `["approved", "rejected"]`.
- `approved` → poursuivre ; `rejected` → un [Human Gate](/fr/nodes/human-gate/).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Branch](/fr/nodes/branch-bool/) — même routage sur un verdict Markdown plutôt qu'un champ JSON.
- [JSON Transform](/fr/nodes/json-transform/) — façonne le JSON qui alimente le `path`.
- [Select (Markdown)](/fr/nodes/select-markdown/) — injection conditionnelle qui produit toujours (sans branchement).
