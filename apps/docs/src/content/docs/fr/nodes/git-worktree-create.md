---
title: Git Worktree Create
description: Le node Git Worktree Create — crée un worktree git dédié (+ branche) et y place le cwd du run.
---

`git.worktree.create`

**Git Worktree Create** exécute `git worktree add -b <branch> <path> <baseRef>` dans `repoDir`, puis place le répertoire de travail du run sur le nouveau worktree. Tous les nodes en aval opèrent alors dans ce checkout isolé sans jamais connaître son chemin — comme un [Workspace Set](/fr/nodes/workspace-set/), mais sur une branche et un worktree fraîchement créés.

Il est **idempotent** : si `git worktree add` échoue parce que le worktree existe déjà et que la porcelain confirme qu'il pointe sur la branche attendue, le run continue quand même (rejouable). Un worktree existant mais qui pointe sur une *autre* branche est une vraie erreur de configuration et lève une exception.

![Le node Git Worktree Create dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `in` | `*` | **Optionnel**, non consommé — disponible pour le chaînage. |

Ce node est un **passthrough** : il ne produit aucun artifact de sortie. À la place, il place le `cwd` du run sur le nouveau worktree (même mécanisme que `workspace.set`), de sorte que les nodes en aval y tournent automatiquement.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `repoDir` | `string` | `""` | Chemin absolu du dépôt git. **Obligatoire** — lève une erreur si vide. |
| `branch` | `string` | `""` | Branche à créer sur le nouveau worktree. **Obligatoire** — validée comme nom de branche git (pas de `-` initial, pas de `..`, pas d'espaces / `~^:?*[\`). |
| `baseRef` | `string` | `HEAD` | Ref de départ de la nouvelle branche. |
| `worktreesDir` | `string` | `.worktrees` | Répertoire (relatif à `repoDir`, contenu à l'intérieur) où sont créés les worktrees. |

Le chemin du worktree est `worktreesDir`/`<branch>` (les `/` de la branche sont slugifiés en `__`), toujours résolu **à l'intérieur** de `repoDir` — un `worktreesDir` contenant `..` est refusé avant tout appel git.

## Comportement à l'exécution

1. Le runner lit la config (lève une erreur si `repoDir` ou `branch` est absent/invalide).
2. Il résout le chemin de worktree contenu : `repoDir`/`worktreesDir`/`<branch slugifiée>`.
3. Il exécute `git worktree add -b <branch> <worktreePath> <baseRef>`.
4. En cas de succès, il émet un outcome `workspace-set` qui place le `cwd` du run sur le worktree.
5. En cas d'échec, il inspecte `git worktree list --porcelain` :
   - Si un worktree existe déjà à ce chemin et pointe sur `<branch>`, l'échec est traité comme un rejeu et le `cwd` est posé.
   - S'il pointe sur une autre branche, il lève une erreur (config incohérente).
   - Sinon il lève une erreur avec la fin du stderr de `git worktree add`.

## Exemple

Créer un worktree isolé, y travailler, puis le nettoyer :

- `repoDir` : le chemin absolu d'un dépôt cloné (par ex. le `Path` d'un [Git Clone](/fr/nodes/git-clone/)), `branch` : un nom de branche par run, `baseRef` : `main`.
- Câbler `in` depuis l'étape amont ; les nodes en aval (un [Claude Code Invoke](/fr/nodes/claude-code-invoke/), puis un [Git Commit & Push](/fr/nodes/git-commit-push/)) tournent automatiquement dans le worktree.
- Terminer le run par un [Git Worktree Remove](/fr/nodes/git-worktree-remove/) pour le démonter.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Git Worktree Remove](/fr/nodes/git-worktree-remove/) — le node de démontage associé.
- [Workspace Set](/fr/nodes/workspace-set/) — le poseur de `cwd` plus simple quand on n'a pas besoin d'un nouveau worktree.
- [Git Clone](/fr/nodes/git-clone/) — fournit le dépôt dans lequel ce node crée un worktree.
- [Git Commit & Push](/fr/nodes/git-commit-push/) — committe le travail fait dans le worktree.
