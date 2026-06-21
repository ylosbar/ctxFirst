---
title: LLM Judge
description: Le node LLM Judge — évalue un artifact d'entrée contre des critères d'acceptation et route vers approved, rejected ou exhausted.
---

`llm.judge`

**LLM Judge** évalue son entrée `subject` contre les critères d'acceptation de `config.judgePrompt`, demande à un LLM un verdict JSON structuré, et route le résultat sur l'un de ses trois ports — `approved`, `rejected` ou `exhausted`. Câbler une transition `isLoop` en sortie du port `rejected` transforme le juge en **boucle de réessais bornée** : un rejet ré-invoque le step amont (jusqu'à `maxAttempts`).

Placez-le en aval d'un node dont la sortie doit être validée (par ex. un [Claude Code Invoke](/fr/nodes/claude-code-invoke/)), avec `rejected` qui reboucle et `exhausted` qui escalade vers un [Human Gate](/fr/nodes/human-gate/).

![Le node LLM Judge dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `subject` | `*` | **Primaire**, requis. L'artifact jugé ; son contenu est envoyé au LLM. |
| Sortie | `approved` | `config.approvedKind` (défaut `Markdown`) | Verdict approuvé : le subject est ré-émis tel quel (pass-through). |
| Sortie | `rejected` | `Markdown` | Verdict rejeté et tentatives restantes : feedback du juge (résumé + commentaires). Câblez une transition `isLoop` ici pour l'auto-loop. |
| Sortie | `exhausted` | `Markdown` | Même feedback que `rejected`, émis quand il ne reste aucune tentative. Typiquement câblé vers un human gate. |

Seul le port produit s'active ; les steps câblés aux autres ports sont sautés en cascade.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `judgePrompt` | `string` | `""` | Critères d'acceptation envoyés au LLM. **Requis** — le runner échoue s'ils sont vides ou blancs. |
| `model` | `string` | `claude-haiku-4-5` | Modèle utilisé pour le verdict. |
| `maxAttempts` | `number` | `3` | Nombre max de tentatives (indexé à 1). Doit être un entier positif ; `exhausted` s'active dès que `attempt >= maxAttempts - 1`. |
| `approvedKind` | `string` (ArtifactKind) | `Markdown` | Kind déclaré sur le port `approved`. Doit être une chaîne non vide si défini. |

## Comportement à l'exécution

1. Lit `judgePrompt` (erreur si vide), `model` et `maxAttempts` ; exige une entrée `subject`.
2. Construit un prompt (critères + subject + instructions de format JSON) et invoque le LLM en mode **streaming**, en journalisant une ligne de **run-log**.
3. Parse le verdict JSON (`approved` / `rejected`, plus un résumé et des commentaires ancrés à des lignes optionnels).
4. En **approved** : ré-émet l'artifact subject inchangé sur `approved` (pass-through).
5. En **rejected** : rend le feedback en Markdown et route vers `exhausted` quand `attempt >= maxAttempts - 1`, sinon vers `rejected`.
6. La boucle elle-même (ré-invoquer le step amont sur `rejected`) est portée par l'orchestrateur via la transition `isLoop` — le runner ignore tout des loops.

## Exemple

Valider une sortie générée avec une boucle de réessais bornée :

- Entrée `subject` ← sortie d'un [Claude Code Invoke](/fr/nodes/claude-code-invoke/) ; `judgePrompt` : les critères d'acceptation ; `maxAttempts` : `3`.
- `approved` → continuer le flux ; `rejected` → reboucler vers le générateur (via une transition `isLoop`) ; `exhausted` → [Human Gate](/fr/nodes/human-gate/).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Claude Code Judge](/fr/nodes/claude-code-judge/) — la variante de juge agentique, pilotée par une Skill.
- [Claude Code Invoke](/fr/nodes/claude-code-invoke/) — un générateur typique dont la sortie est jugée ici.
- [Human Gate](/fr/nodes/human-gate/) — cible typique du port `exhausted`.
