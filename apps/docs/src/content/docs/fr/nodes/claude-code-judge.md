---
title: Claude Code Judge
description: Le node Claude Code Judge — un juge agentique piloté par une Skill qui évalue une entrée et route vers approved, rejected ou exhausted.
---

`claude_code.judge`

**Claude Code Judge** est la variante agentique de [LLM Judge](/fr/nodes/llm-judge/) : il évalue son entrée `subject` en utilisant le CLI Claude Code comme un vrai agent (tools + workspace `cwd`), piloté par des critères d'acceptation fournis comme system prompt. Il partage le même contrat à trois ports — `approved`, `rejected`, `exhausted` — et le même auto-loop borné sur `rejected` via une transition `isLoop`.

Les critères proviennent de l'entrée optionnelle `criteria` (typiquement un [Skill Loader](/fr/nodes/skill-loader/)) quand elle est câblée, sinon de `config.judgePrompt`.

![Le node Claude Code Judge dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `subject` | `*` | **Primaire**, requis. L'artifact jugé ; son contenu est envoyé dans le user prompt. |
| Entrée | `criteria` | `Markdown`, `*` | **Optionnel.** Critères d'acceptation utilisés comme system prompt de l'agent ; prioritaire sur `config.judgePrompt`. |
| Sortie | `approved` | `config.approvedKind` (défaut `Markdown`) | Verdict approuvé : le subject est ré-émis tel quel (pass-through). |
| Sortie | `rejected` | `Markdown` | Verdict rejeté et tentatives restantes : feedback du juge. Câblez une transition `isLoop` ici pour l'auto-loop. |
| Sortie | `exhausted` | `Markdown` | Même feedback que `rejected`, émis quand il ne reste aucune tentative. Typiquement câblé vers un human gate. |

Seul le port produit s'active ; les steps câblés aux autres ports sont sautés en cascade.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `judgePrompt` | `string` | `""` | Critères d'acceptation utilisés quand aucune entrée `criteria` n'est câblée. **Requis** depuis l'une des deux sources — le runner échoue si les deux sont vides. |
| `model` | `string` | `claude-opus-4-7` | Modèle utilisé pour le verdict. |
| `maxAttempts` | `number` | `3` | Nombre max de tentatives (indexé à 1). Doit être un entier positif ; `exhausted` s'active dès que `attempt >= maxAttempts - 1`. |
| `maxTokens` | `number` | `8000` | Plafond de tokens en sortie pour l'agent. |
| `approvedKind` | `string` (ArtifactKind) | `Markdown` | Kind déclaré sur le port `approved`. Doit être une chaîne non vide si défini. |

## Comportement à l'exécution

1. Lit `model`, `maxTokens` et `maxAttempts` ; exige une entrée `subject`.
2. Résout les critères d'acceptation : l'entrée `criteria` câblée l'emporte, à défaut repli sur `config.judgePrompt` (erreur si les deux sont vides).
3. Passe les critères comme **system prompt** et le subject (plus les instructions de format JSON) comme user prompt, invoque le CLI Claude Code en mode **streaming** et journalise une ligne de **run-log**.
4. Parse le verdict JSON (`approved` / `rejected`, plus un résumé et des commentaires ancrés à des lignes optionnels).
5. En **approved** : ré-émet l'artifact subject inchangé sur `approved` (pass-through).
6. En **rejected** : rend le feedback en Markdown et route vers `exhausted` quand `attempt >= maxAttempts - 1`, sinon vers `rejected`. La boucle est portée par l'orchestrateur via la transition `isLoop` — le runner ignore tout des loops.

## Exemple

Valider une sortie générée avec un juge agentique piloté par une Skill :

- Entrée `subject` ← sortie d'un [Claude Code Invoke](/fr/nodes/claude-code-invoke/) ; `criteria` ← un [Skill Loader](/fr/nodes/skill-loader/) (ou définissez `judgePrompt` en inline) ; `maxAttempts` : `3`.
- `approved` → continuer le flux ; `rejected` → reboucler vers le générateur (via une transition `isLoop`) ; `exhausted` → [Human Gate](/fr/nodes/human-gate/).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [LLM Judge](/fr/nodes/llm-judge/) — la variante de juge plus légère, pilotée par un prompt.
- [Skill Loader](/fr/nodes/skill-loader/) — fournit les critères d'acceptation en amont.
- [Human Gate](/fr/nodes/human-gate/) — cible typique du port `exhausted`.
