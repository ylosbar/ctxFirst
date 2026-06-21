---
title: Vue d'ensemble des nodes
description: Catalogue des nodes (step kinds) disponibles dans les workflows CtxFirst.
---

Cette section recense les **nodes** — les briques de base d'un workflow. Chaque node dispose de sa propre page détaillant ses ports, sa configuration et son comportement à l'exécution.

## Qu'est-ce qu'un node ?

Un **node** (ou _step kind_) est une étape exécutable d'un workflow. Chaque node déclare :

- des **ports d'entrée** — les [artifacts](/fr/type-system/artifacts/) qu'il consomme (avec les [`kind`](/fr/type-system/kinds/) acceptés) ;
- des **ports de sortie** — les artifacts qu'il produit ;
- une **config** — les paramètres propres à l'étape.

Les nodes se câblent entre eux via leurs ports : la sortie d'un node alimente l'entrée du suivant. Le moteur de workflow valide la compatibilité des `kind` au moment du câblage — voir [Compatibilité & câblage](/fr/type-system/compatibility/) pour les règles, et la section [Système de types](/fr/type-system/artifacts/) pour le modèle sous-jacent.

## Catalogue

Les groupes ci-dessous suivent les catégories du sélecteur de nodes.

### Sources / Entrées

- **[User Input](/fr/nodes/user-input/)** (`user.input`) — capture la seed fournie par l'utilisateur.
- **[Skill Loader](/fr/nodes/skill-loader/)** (`skill.loader`) — charge un prompt réutilisable de la bibliothèque.
- **[Load File](/fr/nodes/file-load/)** (`file.load`) — lit un fichier unique (Markdown ou JSON).
- **[Load Markdown File](/fr/nodes/file-load-markdown/)** (`file.load-markdown`) — lit un fichier Markdown unique.
- **[Load Files](/fr/nodes/files-load/)** (`files.load`) — lit N fichiers sous un répertoire de base.
- **[Load Files (manifest)](/fr/nodes/files-load-manifest/)** (`files.load-manifest`) — lit les fichiers nommés dans un tableau JSONPath.

### Génération IA

- **[Claude Code Invoke](/fr/nodes/claude-code-invoke/)** (`claude_code.invoke`) — délègue une tâche à Claude Code.
- **[Codex Invoke](/fr/nodes/codex-invoke/)** (`codex.invoke`) — délègue une tâche au CLI Codex.
- **[OpenRouter Invoke](/fr/nodes/openrouter-invoke/)** (`openrouter.invoke`) — appelle un modèle via OpenRouter.
- **[LLM Judge](/fr/nodes/llm-judge/)** (`llm.judge`) — évalue un contenu avec un LLM, route vers approved/rejected/exhausted.
- **[Claude Code Judge](/fr/nodes/claude-code-judge/)** (`claude_code.judge`) — juge agentique piloté par une Skill.

### Transformation

- **[Concat Markdown](/fr/nodes/concat-markdown/)** (`concat.markdown`) — concatène plusieurs fragments Markdown.
- **[Markdown Template](/fr/nodes/markdown-template/)** (`markdown.template`) — substitue des `{{variables}}` dans un gabarit inline.
- **[Transform](/fr/nodes/transform-run/)** (`transform.run`) — applique un parser sauvegardé pour produire un nouvel artifact typé.
- **[JSON Transform](/fr/nodes/json-transform/)** (`json.transform`) — extrait N projections JSONPath d'un payload JSON.
- **[Render Markdown](/fr/nodes/render-markdown/)** (`render.markdown`) — projette n'importe quel artifact typé en Markdown lisible.
- **[Sous-workflow](/fr/nodes/workflow-call/)** (`workflow.call`) — inline le graphe d'un autre template publié.
- **[Invoquer un template](/fr/nodes/template-invoke/)** (`template.invoke`) — démarre une instance enfant isolée d'un autre template.

### Flux / Contrôle

- **[Branch](/fr/nodes/branch-bool/)** (`branch.bool`) — route selon la valeur d'un verdict.
- **[Branch (JSON)](/fr/nodes/branch-json/)** (`branch.json`) — route selon un champ JSONPath (déterministe, sans LLM).
- **[Branch (match)](/fr/nodes/branch-match/)** (`branch.match`) — route selon le variant d'un type somme (kind avancé / moteur).
- **[Select (Markdown)](/fr/nodes/select-markdown/)** (`select.markdown`) — injecte conditionnellement un fragment Markdown (passe-plat, jamais de branchement).
- **[For each](/fr/nodes/loop-foreach/)** (`loop.foreach`) — itère sur une liste en fan-out du sous-graphe.
- **[Collect](/fr/nodes/loop-collect/)** (`loop.collect`) — agrège les sorties par itération d'une boucle.
- **[Format Validate](/fr/nodes/format-validate/)** (`format.validate`) — valide le format d'un artifact, route vers approved/rejected/exhausted.

### Validation humaine

- **[Human Gate](/fr/nodes/human-gate/)** (`human.gate`) — point de validation humaine.

### Système / Exécution

- **[Workspace Set](/fr/nodes/workspace-set/)** (`workspace.set`) — fixe le répertoire de travail des étapes natives suivantes.
- **[Shell Exec](/fr/nodes/shell-exec/)** (`shell.exec`) — exécute une commande shell, branche sur l'exit code.
- **[Git Clone](/fr/nodes/git-clone/)** (`git.clone`) — clone un dépôt distant.
- **[Git Commit & Push](/fr/nodes/git-commit-push/)** (`git.commit_push`) — commite et pousse des changements.
- **[Git Worktree Create](/fr/nodes/git-worktree-create/)** (`git.worktree.create`) — crée un worktree isolé et y positionne le cwd.
- **[Git Worktree Remove](/fr/nodes/git-worktree-remove/)** (`git.worktree.remove`) — supprime un worktree (et optionnellement sa branche).
- **[GitLab Files Fetch](/fr/nodes/gitlab-files-fetch/)** (`gitlab.files.fetch`) — récupère N fichiers d'un dépôt GitLab.
- **[GitLab: créer une MR](/fr/nodes/gitlab-mr-create/)** (`gitlab.mr.create`) — crée une merge request GitLab.
- **[GitLab: merger une MR](/fr/nodes/gitlab-mr-merge/)** (`gitlab.mr.merge`) — merge une merge request GitLab.
- **[Webhook / HTTP call](/fr/nodes/webhook-call/)** (`webhook.call`) — appelle un endpoint REST et stocke la réponse.
- **[Export Run](/fr/nodes/export-run/)** (`export_run`) — snapshot complet du run en un seul JSON autocontenu.

> Les nodes fournis par des plugins (ex. Linear) sont livrés avec leur plugin — voir la section [Plugins](/fr/plugins/overview/).
