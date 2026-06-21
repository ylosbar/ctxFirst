---
title: Format Validate
description: Le node Format Validate — valide un artifact contre le schéma d'un artifact kind et route approved/rejected/exhausted.
---

`format.validate`

**Format Validate** valide son entrée `subject` contre le schéma d'un artifact kind enregistré (`config.expectedKind`) et route vers l'un des trois ports — `approved`, `rejected` ou `exhausted`. C'est la contrepartie **déterministe** de [LLM Judge](/fr/nodes/llm-judge/) : même forme à trois ports et même câblage d'auto-loop, mais sans LLM — le verdict vient d'une vérification de schéma, pas d'un modèle.

![Le node Format Validate dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `subject` | `*` | **Obligatoire**, primaire. L'artifact à valider. Pour les kinds enveloppe c'est le `body` qui est vérifié ; pour les kinds structurés, le contenu sérialisé. Une fence de code Markdown en tête est retirée d'abord. |
| Sortie | `approved` | `config.approvedKind` | Subject ré-émis tel quel quand le format est valide. Défaut `Markdown`. |
| Sortie | `rejected` | `Markdown` | Feedback de validation (résumé + un commentaire par problème de schéma) quand invalide et qu'il reste des tentatives. Une transition `isLoop` sur ce port déclenche l'auto-loop. |
| Sortie | `exhausted` | `Markdown` | Même feedback, émis quand les tentatives sont épuisées. Typiquement câblé vers un [Human Gate](/fr/nodes/human-gate/). |

Exactement un port est émis par run. Le feedback `rejected` est rendu au format judge pour que l'auto-loop de l'orchestrateur le ré-injecte inchangé à la tentative suivante.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `expectedKind` | `string` | — | L'artifact kind enregistré contre lequel valider. **Obligatoire** — le runner échoue s'il manque ou est vide. Un kind inconnu est une erreur de config (remonte comme step en échec, pas comme boucle de rejet). |
| `maxAttempts` | `number` | `3` | Nombre de tentatives avant de router vers `exhausted`. Doit être un entier positif. |
| `approvedKind` | `string` | `Markdown` | Kind annoncé sur le port `approved`. Doit être non vide s'il est défini. |

## Comportement à l'exécution

1. Le runner lit `expectedKind` (erreur s'il manque) et `maxAttempts`, et vérifie que le registre de schémas d'artifacts est disponible.
2. Il lit le `subject` (erreur s'il est absent), en extrayant le body pour les kinds enveloppe (sinon le contenu sérialisé) et en retirant une fence de code en tête.
3. Il valide cette chaîne contre le schéma d'`expectedKind`.
4. Si valide → il ré-émet l'artifact subject original inchangé sur `approved`.
5. Si invalide → il rend le feedback (résumé + un commentaire par problème de schéma) et route vers `rejected` tant qu'il reste des tentatives (`attempt < maxAttempts - 1`), ou vers `exhausted` une fois épuisées.
6. Un `expectedKind` inconnu est levé comme erreur de configuration plutôt que de boucler indéfiniment.

## Exemple

Filtrer un artifact généré sur sa forme avant publication :

- `subject` ← la sortie d'un [Claude Code Invoke](/fr/nodes/claude-code-invoke/), `expectedKind` : le kind auquel il doit se conformer.
- `approved` → poursuivre le flux ; `rejected` → reboucler vers le node producteur (marquer la transition `isLoop`) pour qu'il réessaie avec le feedback ; `exhausted` → [Human Gate](/fr/nodes/human-gate/).

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [LLM Judge](/fr/nodes/llm-judge/) — le frère basé LLM avec le même routage approved/rejected/exhausted.
- [Claude Code Judge](/fr/nodes/claude-code-judge/) — la variante de juge agentique.
- [Human Gate](/fr/nodes/human-gate/) — cible typique du port `exhausted`.
