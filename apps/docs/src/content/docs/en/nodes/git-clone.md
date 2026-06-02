---
title: Git Clone
description: The Git Clone node — clones a remote repository into a folder and outputs its absolute path.
---

`git.clone`

**Git Clone** clones a remote git repository (GitLab via access token, but provider-agnostic) into a chosen folder and emits the clone's **absolute path** as a `Path` artifact. That path is what you wire into a downstream [Workspace Set](/en/nodes/workspace-set/) (or a `git.worktree.create`) so the rest of the run operates inside the clone.

It is built **idempotent**: with `cleanBefore` (the default) the target is wiped and re-cloned, so replaying the step yields exactly the same state.

![The Git Clone node in the workflow studio](../../../../assets/nodes/git-clone.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `*` | **Optional**, not consumed — available for chaining. |
| Output | `out` | `Path` | Primary. Absolute path of the cloned repo. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `repoUrl` | `string` | — | HTTPS URL of the repo. **Required** — must start with `https://`. |
| `baseDir` | `string` | managed clones dir | Root directory that contains the clone. Defaults to the app-managed clones root when empty. |
| `folder` | `string` | — | Sub-path of the clone inside `baseDir`. **Required** — must not contain `..`. |
| `branch` | `string` | repo default | Branch to check out. Validated as a git branch name. |
| `cleanBefore` | `boolean` | `true` | When `true`, wipe the target before cloning (idempotent). When `false`, fail if the target exists and is non-empty. |

The target (`baseDir`/`folder`) is always resolved **inside** `baseDir` — it can never escape it, and neither the wipe nor the clone can touch anything outside it.

## Security

- The access token is resolved at runtime (encrypted settings, like Linear / OpenRouter, with a fallback on the `GITLAB_TOKEN` env var), never stored in the template.
- The token is **redacted** in every error message and metadata, and the origin is rewritten without the token after the clone.

## Runtime behavior

1. The runner parses the config (error if `repoUrl`, `baseDir`, or `folder` is missing/invalid).
2. It resolves the contained `target` inside `baseDir`.
3. If `cleanBefore`, it wipes the target; otherwise it fails if the target exists and is non-empty.
4. It resolves the access token (settings, then `GITLAB_TOKEN`).
5. It clones the repo (optionally at `branch`) into the target, then rewrites the origin without the token.
6. It stores a `Path` artifact pointing at the clone (metadata: `provider: git`, redacted `repoUrl`, `branch`) and produces it on `out`.

## Example

Clone a repo, then operate inside it:

- `repoUrl`: the HTTPS URL, `folder`: a sub-folder name, `branch`: the target branch.
- Output `out` (`Path`) → wire it into a [Workspace Set](/en/nodes/workspace-set/) `cwd`, then a [Claude Code Invoke](/en/nodes/claude-code-invoke/) and a [Git Commit & Push](/en/nodes/git-commit-push/).

## See also

- [Nodes overview](/en/nodes/overview/)
- [Workspace Set](/en/nodes/workspace-set/) — consumes the produced path as the working directory.
- [Git Commit & Push](/en/nodes/git-commit-push/) — pushes changes made in the clone.
