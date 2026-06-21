---
title: OpenRouter Invoke
description: Le node OpenRouter Invoke — appelle un modèle de chat-completion OpenRouter avec une Skill optionnelle en contexte système.
---

`openrouter.invoke`

**OpenRouter Invoke** appelle un modèle de chat-completion OpenRouter : il concatène le body d'une Skill optionnelle configurée avec son entrée `prompt`, envoie une requête en un seul appel (sans streaming), et stocke la réponse comme un artifact typé sur `out`. Il est polymorphe sur `outputKind`, mais seul le kind d'enveloppe `Markdown` est actuellement supporté.

Câblez un prompt en amont (par ex. via [Skill Loader](/fr/nodes/skill-loader/) ou [Concat Markdown](/fr/nodes/concat-markdown/)) et récupérez le résultat en aval.

![Le node OpenRouter Invoke dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `prompt` | `*` | Port polymorphe. Plusieurs entrées entrantes sont concaténées (`\n\n`) dans le message utilisateur. Le prompt ou le body de la Skill doit être non vide — sinon le runner échoue. |
| Sortie | `out` | `config.outputKind` | La réponse du modèle, stockée dans le kind d'artifact choisi. |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` (ArtifactKind) | `Markdown` | Kind de l'artifact produit. Doit être un kind d'enveloppe texte supporté (`Markdown`) — sinon le runner échoue. |
| `model` | `string` | `openai/gpt-4o-mini` | Slug du modèle OpenRouter. Repli sur le modèle par défaut configuré par l'utilisateur si absent. |
| `maxTokens` | `number` | `4000` | Plafond de tokens en sortie. Utilisé quand la valeur est un nombre positif, sinon `4000`. |
| `skillRef` | `string` | — | **Optionnel.** Référence d'une Skill dont le body est ajouté en tête comme contexte système. Le runner échoue si une ref est définie mais que le registre de skills est indisponible. |
| `actorRole` | `string` | `Developer` | Rôle assigné lorsqu'une validation humaine est requise (voir ci-dessous). |

## Comportement à l'exécution

1. Lit `outputKind` (validé contre les kinds d'enveloppe texte supportés), `model` (repli sur le défaut) et `maxTokens`.
2. Si `skillRef` est défini, résout la Skill et utilise son `body` comme contexte système (erreur si le registre de skills manque).
3. Concatène les entrées `prompt` non vides dans le message utilisateur ; échoue si le body de la Skill et le prompt sont tous deux vides.
4. Appelle OpenRouter en mode **un seul appel** (sans streaming) ; échoue si la réponse est vide.
5. Stocke la réponse comme un artifact d'enveloppe `Markdown` au kind `outputKind` (métadonnées : `source`, `skillRef`, modèle, `modelUsed`, provider, tokens, latence).
6. Journalise une ligne de **run-log**, puis renvoie `produced` — ou `produced-pending-human` (avec `actorRole`) quand `humanGateRequired`.

## Exemple

- `model` : `openai/gpt-4o-mini`, `outputKind` : `Markdown`.
- Entrée `prompt` ← sortie d'un [Skill Loader](/fr/nodes/skill-loader/) ou d'un [Concat Markdown](/fr/nodes/concat-markdown/).
- Sortie `out` (`Markdown`) → entrée d'un [Human Gate](/fr/nodes/human-gate/) pour validation.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Codex Invoke](/fr/nodes/codex-invoke/) — le node d'invocation du CLI Codex (OpenAI).
- [Claude Code Invoke](/fr/nodes/claude-code-invoke/) — le node d'invocation Anthropic.
- [Skill Loader](/fr/nodes/skill-loader/) — fournit un prompt réutilisable en amont.
