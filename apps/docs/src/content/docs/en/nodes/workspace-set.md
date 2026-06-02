---
title: Workspace Set
description: The Workspace Set node — sets the working directory used by subsequent native steps.
---

`workspace.set`

**Workspace Set** sets the **working directory** (`cwd`) used by the native steps that follow — typically a [Claude Code Invoke](/en/nodes/claude-code-invoke/) (the Claude CLI runs there) or a [Git Commit & Push](/en/nodes/git-commit-push/). It produces no artifact: it is a pure side-effect on the run's state, kept chainable so it can sit in the middle of a flow.

![The Workspace Set node in the workflow studio](../../../../assets/nodes/workspace-set.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `*` | **Optional**, **not consumed** — only there to chain the node into the flow. Its content is ignored at runtime. |
| Output | — | — | No output port. The node is a **passthrough**: the orchestrator skips over it when resolving the inputs of the downstream step. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `cwd` | `string` | `""` | Working directory applied to subsequent native steps. **Required** — the runner fails if empty. Read only from config (the inspector field), never from the input port. |

## Runtime behavior

1. The runner reads `step.config.cwd` and trims it (error if empty or missing).
2. It returns a `workspace-set` outcome carrying the `cwd`.
3. The orchestrator emits a `WorkspaceChanged` event, then **auto-validates** the step (no human gate, no artifact).
4. Because the node is a passthrough, the next step that needs an upstream artifact resolves it **across** this node (its `previousDataStepId` skips the `workspace.set`).

## Example

Point the run at a project directory before invoking an agent:

- `cwd`: the absolute path of the project.
- Input `in` ← (optional) the output of a previous node, just for chaining.
- A downstream [Claude Code Invoke](/en/nodes/claude-code-invoke/) then runs the Claude CLI inside that directory.

:::note
For a freshly cloned repo, wire the [Git Clone](/en/nodes/git-clone/) `out` (`Path`) into the chain and set `cwd` accordingly, or use a `git.worktree.create` step, which sets the workspace itself.
:::

## See also

- [Nodes overview](/en/nodes/overview/)
- [Git Clone](/en/nodes/git-clone/) — produces the path you may want to set as the workspace.
- [Git Commit & Push](/en/nodes/git-commit-push/) — a native step that runs in the configured `cwd`.
