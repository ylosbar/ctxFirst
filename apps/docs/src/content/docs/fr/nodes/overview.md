---
title: Vue d'ensemble des nodes
description: Catalogue des nodes (step kinds) disponibles dans les workflows CtxFirst.
---

:::caution[Ébauche]
Cette section recense les **nodes** — les briques de base d'un workflow. Une page par node (ou par famille) viendra détailler les entrées, sorties et la configuration.
:::

## Qu'est-ce qu'un node ?

Un **node** (ou _step kind_) est une étape exécutable d'un workflow. Chaque node déclare :

- des **ports d'entrée** — les artifacts qu'il consomme (avec les `kind` acceptés) ;
- des **ports de sortie** — les artifacts qu'il produit ;
- une **config** — les paramètres propres à l'étape.

Les nodes se câblent entre eux via leurs ports : la sortie d'un node alimente l'entrée du suivant. Le moteur de workflow valide la compatibilité des `kind` au moment du câblage.

## Catalogue

### LLM & agents

- **[Claude Code Invoke](/fr/nodes/claude-code-invoke/)** (`claude_code.invoke`) — délègue une tâche à Claude Code.
- **Codex Invoke** (`codex.invoke`) — délègue une tâche à Codex.
- **OpenRouter: Invoke** (`openrouter.invoke`) — appelle un modèle via OpenRouter.
- **LLM Judge** (`llm.judge`) — évalue un contenu selon des critères.
- **[Skill Loader](/fr/nodes/skill-loader/)** (`skill.loader`) — charge une skill réutilisable.

### Fichiers & contenu

- **[Load File](/fr/nodes/file-load/)** (`file.load`) — lit un fichier unique.
- **Load Files** (`files.load`) — lit N fichiers sous un répertoire de base.
- **Concat Markdown** (`concat.markdown`) — concatène plusieurs fragments Markdown.
- **Render Markdown** (`render.markdown`) — rend un gabarit Markdown.
- **Format Validate** (`format.validate`) — valide le format d'un artifact.
- **JSON Transform** (`json.transform`) — transforme un payload JSON.

### Git & forge

- **[Git Clone](/fr/nodes/git-clone/)** (`git.clone`) — clone un dépôt.
- **[Git Commit & Push](/fr/nodes/git-commit-push/)** (`git.commit_push`) — commite et pousse des changements.
- **Git Worktree Create / Remove** (`git.worktree.create`, `git.worktree.remove`) — gère un worktree isolé.
- **GitLab: create MR / merge MR / wait for pipeline** (`gitlab.mr.create`, `gitlab.mr.merge`, `gitlab.pipeline.wait`) — opérations GitLab.

### Contrôle de flux

- **Branch** (`branch.bool`) — branche selon une condition booléenne.
- **Branch (match)** (`branch.match`) — branche selon une correspondance.
- **For each** (`loop.foreach`) — itère sur une liste.
- **Collect** (`loop.collect`) — agrège les résultats d'une boucle.
- **Sub-workflow** (`workflow.call`) — appelle un autre workflow.

### Humain & I/O

- **[Human Gate](/fr/nodes/human-gate/)** (`human.gate`) — point de validation humaine.
- **[User Input](/fr/nodes/user-input/)** (`user.input`) — collecte une saisie utilisateur.
- **Webhook: HTTP call** (`webhook.call`) — appelle un endpoint HTTP.
- **Shell Exec** (`shell.exec`) — exécute une commande shell.
- **[Workspace Set](/fr/nodes/workspace-set/)** (`workspace.set`) — fixe le répertoire de travail.
- **Export Run** (`export_run`) — exporte les artifacts d'un run.

> À détailler : pour chaque node, créer une page dédiée dans `src/content/docs/fr/nodes/` (elle apparaîtra automatiquement dans la sidebar).
