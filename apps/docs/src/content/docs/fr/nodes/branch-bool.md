---
title: Branch
description: Le node Branch — route le workflow vers l'une de N branches selon un verdict Markdown.
---

`branch.bool`

**Branch** lit le `body` (après `trim`) de son entrée Markdown comme un _verdict_ et route l'exécution vers exactement un des N ports de sortie — un port par entrée de `config.cases`. Le port correspondant ré-émet l'artifact d'entrée tel quel ; les autres ports ne sont jamais produits, et l'orchestrateur skippe en cascade les steps en aval qui ne sont accessibles que par eux.

À câbler après un node qui émet une chaîne de verdict courte et contrôlée (p. ex. le verdict d'un [LLM Judge](/fr/nodes/llm-judge/) ou le résultat d'un [Format Validate](/fr/nodes/format-validate/)), puis à raccorder un chemin distinct en aval de chaque port de cas.

![Le node Branch dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `verdict` | `Markdown` | **Obligatoire**, primaire. Son `body.trim()` est le verdict comparé aux cas. |
| Sortie | `<cas>` | `inputKind` | Un port de sortie par entrée de `config.cases`. Émis quand le verdict égale ce label. |

L'artifact d'entrée est ré-émis tel quel sur le port choisi (aucun nouvel octet écrit). Les sorties sont de kind `Markdown` par défaut, sauf si `inputKind` le surcharge.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `cases` | `string[]` | `["true", "false"]` | **Obligatoire.** ≥2 labels uniques, chacun respectant `/^[a-zA-Z_][a-zA-Z0-9_-]*$/` (servent de noms de ports). Chacun devient un port de sortie. |
| `inputKind` | `string` | `Markdown` | Kind d'artifact déclaré sur les ports de sortie (kind de passthrough). |

## Comportement à l'exécution

1. Le runner valide `config.cases` (≥2 labels uniques et sûrs comme noms de ports — erreur sinon).
2. Il lit l'artifact sur `verdict` (erreur si absent ou non `Markdown`), puis prend `body.trim()` comme verdict.
3. Il cherche le cas dont le label égale le verdict (erreur si aucun ne matche).
4. Il charge la meta de l'artifact d'entrée et le ré-émet tel quel (`produced-on-port`) sur le port correspondant. Les steps câblés uniquement aux autres ports sont skippés en cascade.

## Exemple

Router sur un verdict oui/non d'un juge :

- `verdict` (`Markdown`) ← un node amont qui émet exactement `pass` ou `fail`.
- `cases` : `["pass", "fail"]`.
- `pass` → poursuivre le flux ; `fail` → un [Human Gate](/fr/nodes/human-gate/) pour relecture.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Branch (JSON)](/fr/nodes/branch-json/) — même routage, mais lit un champ JSON plutôt qu'un verdict Markdown.
- [Select (Markdown)](/fr/nodes/select-markdown/) — injection conditionnelle qui produit toujours (sans branchement).
- [LLM Judge](/fr/nodes/llm-judge/) — source typique du verdict.
