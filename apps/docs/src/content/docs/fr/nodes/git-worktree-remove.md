---
title: Git Worktree Remove
description: Le node Git Worktree Remove — retire un worktree git et, optionnellement, sa branche locale, en produisant un rapport Markdown.
---

`git.worktree.remove`

**Git Worktree Remove** exécute `git worktree remove --force` sur un worktree sous `repoDir` et, quand `deleteBranch` est actif, supprime aussi sa branche locale (`git branch -D`). C'est le pendant de démontage de [Git Worktree Create](/fr/nodes/git-worktree-create/), pensé comme l'étape de nettoyage en fin de run. Il produit un rapport `Markdown` et ne **branche pas** — l'orchestrateur n'a jamais à router sur son résultat.

Il est **idempotent best-effort** : une branche déjà absente ne fait pas échouer le step (le stderr de `branch -D` est alors reporté dans le rapport), de sorte que le node peut être rejoué sans erreur.

![Le node Git Worktree Remove dans le studio de workflow (capture à ajouter)](../../../../assets/nodes/placeholder.png)

## Ports

| Sens | Port | Kind | Notes |
| --- | --- | --- | --- |
| Entrée | `in` | `*` | **Optionnel**, non consommé — disponible pour le chaînage. |
| Sortie | `report` | `Markdown` | Port primaire. Rapport du retrait (worktree, dépôt, sort de la branche, code de sortie, et fin du stderr de `branch -D` le cas échéant). |

## Configuration

| Clé | Type | Défaut | Description |
| --- | --- | --- | --- |
| `repoDir` | `string` | `""` | Chemin absolu du dépôt git. **Obligatoire** — lève une erreur si vide. |
| `worktreePath` | `string` | `""` | Chemin du worktree à retirer (résolu à l'intérieur de `repoDir`). **Obligatoire** — lève une erreur si vide. |
| `deleteBranch` | `boolean` | `true` | Quand `true`, supprime aussi la branche locale après le retrait du worktree. |
| `branch` | `string` | `""` | Branche à supprimer. **Obligatoire quand `deleteBranch` vaut `true`** — validée comme nom de branche git. Ignorée quand `deleteBranch` vaut `false`. |

Le `worktreePath` est toujours résolu **à l'intérieur** de `repoDir` — un chemin qui s'en échappe est refusé avant tout appel git.

## Comportement à l'exécution

1. Le runner lit la config (lève une erreur si `repoDir` ou `worktreePath` est absent ; lève une erreur si `deleteBranch` est actif et `branch` invalide).
2. Il résout le chemin de worktree contenu sous `repoDir`.
3. Il exécute `git worktree remove --force <worktreePath>` (lève une erreur si exit ≠ 0).
4. Si `deleteBranch` est actif, il exécute `git branch -D <branch>`. Un exit ≠ 0 (par ex. branche déjà absente) est consigné dans le rapport mais ne **fait pas** échouer le step.
5. Il stocke un artifact rapport `Markdown` (métadonnées : `worktree`, `repo`, `branchDeleted`) et le produit sur `report`.

## Exemple

Démonter le worktree créé plus tôt dans le run :

- `repoDir` : le chemin du dépôt, `worktreePath` : le chemin du worktree créé par le [Git Worktree Create](/fr/nodes/git-worktree-create/) amont, `branch` : la même branche, `deleteBranch` : `true`.
- Sortie `report` (`Markdown`) → un [Concat Markdown](/fr/nodes/concat-markdown/) pour l'intégrer à un récapitulatif de run, ou simplement laissée comme artifact final du run.

## Voir aussi

- [Vue d'ensemble des nodes](/fr/nodes/overview/)
- [Git Worktree Create](/fr/nodes/git-worktree-create/) — le node qui crée le worktree que celui-ci retire.
- [Workspace Set](/fr/nodes/workspace-set/) — le poseur de `cwd` pour le cas sans worktree.
- [Git Commit & Push](/fr/nodes/git-commit-push/) — tourne généralement avant le démontage pour persister le travail.
