---
title: Git Commit & Push
description: Le node Git Commit & Push — stage des chemins explicites, commit, rebase et push en --force-with-lease.
---

`git.commit_push`

**Git Commit & Push** stage les `paths` explicites de sa config, les commit, rebase sur la remote, et push en `--force-with-lease`. Il route le résultat sur l'un de trois ports — `pushed`, `conflict` ou `nothing` — pour que les nodes en aval ne s'exécutent que sur la branche réellement empruntée (ex. câbler `conflict` → [Human Gate](/fr/nodes/human-gate/)).

Il s'exécute dans le `cwd` du workspace, il lui faut donc un [Workspace Set](/fr/nodes/workspace-set/) (ou un `git.worktree.create`) en amont.

![Le node Git Commit & Push dans le studio de workflow](../../../../assets/nodes/git-commit-push.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `message` | `Markdown` | **Optionnel**. Quand câblé, son body sert de message de commit (l'emporte sur `config.message`). |
| Sortie | `pushed` | `Markdown` | Primaire. Commit poussé sur la branche remote. |
| Sortie | `conflict` | `Markdown` | Le rebase a rencontré un conflit et a été aborté — à résoudre en aval. |
| Sortie | `nothing` | `Markdown` | Working tree propre / déjà poussé — no-op. |

Chaque sortie porte un rapport Markdown (port, branche, remote, SHA, tentatives, et une queue de stderr si pertinent). Seul le port produit s'active ; les étapes câblées sur les autres ports sont skippées en cascade.

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `paths` | `string[]` | — | Chemins à stager. **Obligatoire**, non vide ; chaque entrée est une chaîne non vide qui ne doit pas commencer par `-`. |
| `message` | `string` | — | Message de commit. Utilisé quand aucune entrée `message` n'est câblée. Un message est requis depuis l'une des deux sources. |
| `branch` | `string` | — | Branche cible. **Obligatoire** — validée comme nom de branche git. |
| `remote` | `string` | `origin` | Remote à fetch/push. Ne doit pas commencer par `-`. |
| `maxRetries` | `number` | `3` | Tentatives fetch → rebase → push, bornées à `1..10`. |

## Comportement à l'exécution

1. Le runner lit le `cwd` depuis le workspace (erreur si absent — placez un [Workspace Set](/fr/nodes/workspace-set/) ou un `git.worktree.create` en amont).
2. Il stage uniquement les chemins explicites (`git add -- <paths>`).
3. Si le tree est alors propre, il route sur **`nothing`** (idempotent : un replay no-op emprunte le même chemin).
4. Il commit avec le message (entrée, sinon config).
5. Il boucle jusqu'à `maxRetries` : `fetch`, puis `rebase --autostash` sur `<remote>/<branch>`, puis `push --force-with-lease`.
   - Sur un conflit de rebase, il fait `rebase --abort` (laissant un tree propre) et route sur **`conflict`**.
   - Sur un push réussi, il route sur **`pushed`**.
   - Cas premier push : une branche remote absente fait échouer `fetch`, ce qui est normal — le push crée la ref.
6. Si les tentatives sont épuisées, il throw avec la queue du dernier stderr.

`--force-with-lease` (jamais `--force`) refuse d'écraser une ref remote qui a bougé entre le fetch et le push, donc les runs concurrents retentent au lieu de s'écraser entre eux.

## Exemple

Commiter des fichiers générés et brancher selon le résultat :

- `paths` : les fichiers à stager, `branch` : la branche de travail, `message` ← (optionnel) un résumé Markdown d'un [Claude Code Invoke](/fr/nodes/claude-code-invoke/) en amont.
- `pushed` → continuer le flow ; `conflict` → [Human Gate](/fr/nodes/human-gate/) pour résolution humaine ; `nothing` → s'arrêter sans bruit.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Workspace Set](/fr/nodes/workspace-set/) — fixe le `cwd` dans lequel ce node s'exécute.
- [Git Clone](/fr/nodes/git-clone/) — fournit le dépôt dans lequel commiter.
- [Human Gate](/fr/nodes/human-gate/) — cible typique du port `conflict`.
