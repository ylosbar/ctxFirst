---
title: Tutoriel
description: Apprenez CtxFirst par l'exemple — un workflow complet expliqué par page.
sidebar:
  order: 0
---

Cette section est un tutoriel **par l'exemple** : chaque page reconstruit un workflow complet, du premier node jusqu'au run, en expliquant les choix de câblage et de config au passage.

Commencez par le plus simple, puis montez en complexité.

## Exemples

- **[Prompt → réponse](/fr/tutorials/user-input-claude-invoke/)** — le workflow minimal : une saisie utilisateur envoyée à un modèle. Deux nodes, [User Input](/fr/nodes/user-input/) et [Claude Code Invoke](/fr/nodes/claude-code-invoke/).
- **[Génération avec boucle de validation](/fr/tutorials/human-validation-loop/)** — le même flux, avec la validation humaine cochée sur le node de génération et une boucle qui le ré-invoque tant que l'humain n'a pas validé.
- **[Fusionner deux prompts en un seul contexte](/fr/tutorials/concat-files-claude/)** — charger deux fichiers dans des variables, les fusionner avec [Concat Markdown](/fr/nodes/concat-markdown/), puis envoyer le résultat au modèle.
- **[Cloner un dépôt, lancer Claude dessus, puis commiter](/fr/tutorials/clone-repo-claude-commit/)** — un workflow de bout en bout sur un vrai dépôt : Git Clone → Workspace Set → [Skill Loader](/fr/nodes/skill-loader/) → [Claude Code Invoke](/fr/nodes/claude-code-invoke/) → Git Commit & Push.

> D'autres exemples viendront s'ajouter ici, chacun dans sa propre page sous `src/content/docs/fr/tutorials/`.
