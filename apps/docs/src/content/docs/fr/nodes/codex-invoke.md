---
title: Codex Invoke
description: Le node Codex Invoke — invoque le CLI Codex (OpenAI) en utilisant son entrée comme prompt.
---

`codex.invoke`

**Codex Invoke** est l'équivalent OpenAI de [Claude Code Invoke](/fr/nodes/claude-code-invoke/) : il prend la valeur de son port d'entrée `prompt`, l'envoie au CLI Codex (en streaming), et produit la sortie du modèle comme un artifact typé sur `out`. Il est polymorphe sur `outputKind` — l'artifact est sérialisé dans le kind que vous configurez.

Câblez un prompt en amont (par ex. via [Skill Loader](/fr/nodes/skill-loader/) ou [User Input](/fr/nodes/user-input/)) et récupérez le résultat en aval.

![Le node Codex Invoke dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `prompt` | `*` | Port polymorphe : `inputs[0].content` est envoyé comme prompt utilisateur, quel que soit le kind. Une valeur est requise (le runner échoue si `prompt` est vide). |
| Sortie | `out` | `config.outputKind` | La sortie du modèle, sérialisée dans le kind cible. |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` (ArtifactKind) | `Markdown` | Kind de l'artifact produit. **Requis** — le runner échoue si ce n'est pas une chaîne. |
| `model` | `string` | `gpt-5-codex` | Modèle Codex invoqué. |
| `maxTokens` | `number` | `8000` | Plafond de tokens en sortie. |
| `actorRole` | `string` | `Developer` | Rôle assigné lorsqu'une validation humaine est requise (voir ci-dessous). |

## Comportement à l'exécution

1. Lit la config (`model`, `maxTokens`, `outputKind`) — erreur si `outputKind` manque, ou s'il n'y a aucune valeur sur `prompt`.
2. Assemble le prompt (entrée + historique de boucle) via l'_assembleur de contexte_.
3. Invoque le CLI Codex en mode **streaming** : des events typés sont émis sur le bus de session.
4. Sérialise la sortie dans `outputKind`, stocke l'artifact (métadonnées : modèle, provider, tokens, latence, coût).
5. Journalise une ligne de **run-log** (provider, modèle, tokens, coût, latence, ref de sortie).
6. Si le step a `humanGateRequired`, renvoie `produced-pending-human` (avec `actorRole`) ; sinon `produced`.

## Exemple

- `model` : `gpt-5-codex`, `outputKind` : `Markdown`.
- Entrée `prompt` ← sortie d'un [Skill Loader](/fr/nodes/skill-loader/).
- Sortie `out` (`Markdown`) → entrée d'un [Human Gate](/fr/nodes/human-gate/) pour validation.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Claude Code Invoke](/fr/nodes/claude-code-invoke/) — le node d'invocation Anthropic équivalent.
- [OpenRouter Invoke](/fr/nodes/openrouter-invoke/) — invoque un modèle via OpenRouter.
- [Skill Loader](/fr/nodes/skill-loader/) — fournit un prompt réutilisable en amont.
