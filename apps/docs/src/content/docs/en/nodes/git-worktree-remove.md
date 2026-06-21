---
title: Git Worktree Remove
description: The Git Worktree Remove node — removes a git worktree and optionally its local branch, emitting a Markdown report.
---

`git.worktree.remove`

**Git Worktree Remove** runs `git worktree remove --force` on a worktree under `repoDir` and, when `deleteBranch` is on, also deletes its local branch (`git branch -D`). It is the teardown counterpart of [Git Worktree Create](/en/nodes/git-worktree-create/), meant as the cleanup step at the end of a run. It emits a `Markdown` report and does **not** branch — the orchestrator never has to route on its result.

It is **idempotent best-effort**: a branch that is already gone does not fail the step (the branch `-D` stderr is surfaced in the report instead), so the node can be replayed without error.

![The Git Worktree Remove node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `*` | **Optional**, not consumed — available for chaining. |
| Output | `report` | `Markdown` | Primary. Report of the removal (worktree, repo, branch outcome, exit code, and a `branch -D` stderr tail when relevant). |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `repoDir` | `string` | `""` | Absolute path to the git repo. **Required** — throws if empty. |
| `worktreePath` | `string` | `""` | Path of the worktree to remove (resolved inside `repoDir`). **Required** — throws if empty. |
| `deleteBranch` | `boolean` | `true` | When `true`, also delete the local branch after removing the worktree. |
| `branch` | `string` | `""` | Branch to delete. **Required when `deleteBranch` is `true`** — validated as a git branch name. Ignored when `deleteBranch` is `false`. |

The `worktreePath` is always resolved **inside** `repoDir` — a path that escapes the repo is refused before any git call.

## Runtime behavior

1. The runner parses the config (throws if `repoDir` or `worktreePath` is missing; throws if `deleteBranch` is on and `branch` is invalid).
2. It resolves the contained worktree path under `repoDir`.
3. It runs `git worktree remove --force <worktreePath>` (throws on non-zero exit).
4. If `deleteBranch` is on, it runs `git branch -D <branch>`. A non-zero exit (e.g. branch already gone) is recorded in the report but does **not** fail the step.
5. It stores a `Markdown` report artifact (metadata: `worktree`, `repo`, `branchDeleted`) and produces it on `report`.

## Example

Tear down the worktree created earlier in the run:

- `repoDir`: the repo path, `worktreePath`: the worktree path created by the upstream [Git Worktree Create](/en/nodes/git-worktree-create/), `branch`: the same branch, `deleteBranch`: `true`.
- Output `report` (`Markdown`) → a [Concat Markdown](/en/nodes/concat-markdown/) to fold into a run summary, or simply left as the run's final artifact.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Git Worktree Create](/en/nodes/git-worktree-create/) — the node that creates the worktree this one removes.
- [Workspace Set](/en/nodes/workspace-set/) — the `cwd`-setter for the non-worktree case.
- [Git Commit & Push](/en/nodes/git-commit-push/) — usually runs before teardown to persist the work.
