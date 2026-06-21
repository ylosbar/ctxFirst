---
title: Git Worktree Create
description: The Git Worktree Create node — creates a dedicated git worktree (+ branch) and sets the run's cwd to it.
---

`git.worktree.create`

**Git Worktree Create** runs `git worktree add -b <branch> <path> <baseRef>` inside `repoDir`, then sets the run's working directory to the new worktree. Every downstream node then operates inside that isolated checkout without ever knowing its path — like a [Workspace Set](/en/nodes/workspace-set/), but on a freshly created branch and worktree.

It is built **idempotent**: if `git worktree add` fails because the worktree already exists and the porcelain confirms it tracks the expected branch, the run still proceeds (replay-safe). A worktree that exists but tracks a *different* branch is a real config error and throws.

![The Git Worktree Create node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `*` | **Optional**, not consumed — available for chaining. |

This node is a **passthrough**: it produces no output artifact. Instead it sets the run's `cwd` to the new worktree (the same mechanism as `workspace.set`), so downstream nodes run inside it automatically.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `repoDir` | `string` | `""` | Absolute path to the git repo. **Required** — throws if empty. |
| `branch` | `string` | `""` | Branch to create on the new worktree. **Required** — validated as a git branch name (no leading `-`, no `..`, no whitespace / `~^:?*[\`). |
| `baseRef` | `string` | `HEAD` | Ref the new branch starts from. |
| `worktreesDir` | `string` | `.worktrees` | Directory (relative to `repoDir`, contained inside it) where worktrees are created. |

The worktree path is `worktreesDir`/`<branch>` (with `/` in the branch slugified to `__`), always resolved **inside** `repoDir` — a `worktreesDir` containing `..` is refused before any git call.

## Runtime behavior

1. The runner parses the config (throws if `repoDir` or `branch` is missing/invalid).
2. It resolves the contained worktree path: `repoDir`/`worktreesDir`/`<slugified branch>`.
3. It runs `git worktree add -b <branch> <worktreePath> <baseRef>`.
4. On success, it emits a `workspace-set` outcome pointing the run's `cwd` at the worktree.
5. On failure, it inspects `git worktree list --porcelain`:
   - If a worktree already exists at that path tracking `<branch>`, it treats the failure as a replay and still sets the `cwd`.
   - If it tracks a different branch, it throws (config mismatch).
   - Otherwise it throws with the `git worktree add` stderr tail.

## Example

Create an isolated worktree, work in it, then clean it up:

- `repoDir`: the absolute path of a cloned repo (e.g. the `Path` from a [Git Clone](/en/nodes/git-clone/)), `branch`: a per-run branch name, `baseRef`: `main`.
- Wire `in` from the upstream step; downstream nodes (a [Claude Code Invoke](/en/nodes/claude-code-invoke/), then a [Git Commit & Push](/en/nodes/git-commit-push/)) automatically run inside the worktree.
- End the run with a [Git Worktree Remove](/en/nodes/git-worktree-remove/) to tear it down.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Git Worktree Remove](/en/nodes/git-worktree-remove/) — the matching teardown node.
- [Workspace Set](/en/nodes/workspace-set/) — the simpler `cwd`-setter when you don't need a new worktree.
- [Git Clone](/en/nodes/git-clone/) — provides the repo this node creates a worktree in.
- [Git Commit & Push](/en/nodes/git-commit-push/) — commits the work done inside the worktree.
