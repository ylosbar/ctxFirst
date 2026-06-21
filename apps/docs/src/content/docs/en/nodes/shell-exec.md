---
title: Shell Exec
description: The Shell Exec node — runs a shell command in the workspace cwd and branches on its exit code.
---

`shell.exec`

**Shell Exec** runs a command in the workspace `cwd` and branches on its exit code. By default it routes to `success` (exit 0) or `failure` (anything else); with a configured `exitCodes` map it routes to your own named ports instead. It also always exposes the raw `stdout` and `stderr` streams on dedicated ports.

It runs inside the workspace `cwd`, so it needs a [Workspace Set](/en/nodes/workspace-set/) (or a [Git Worktree Create](/en/nodes/git-worktree-create/)) upstream — the runner throws if no `cwd` is set.

![The Shell Exec node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `context` | `*` | **Optional**, primary. Lets you anchor the step in the DAG. Its content is **not** interpolated into the command (no input → command substitution in V1). |
| Output | `success` | `Markdown` | Default mode, primary. Fired when the command exits `0`. |
| Output | `failure` | `Markdown` | Default mode. Fired on any non-zero exit (including timeout / signal). |
| Output | `<named>` | `Markdown` | Configured mode. With `exitCodes` set, the `success`/`failure` pair is replaced by your named ports, one of which is the catch-all. |
| Output | `stdout` | `Markdown` | Verbatim stdout stream. **Always** produced. |
| Output | `stderr` | `Markdown` | Verbatim stderr stream. **Always** produced. |

Exactly one branch port fires per run (mutually exclusive); the unproduced branch ports are skip-propagated to downstream steps. `stdout` and `stderr` are produced on every run regardless of the branch taken.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `command` | `string` \| `string[]` | `""` | The command to run (string, or an argv array). **Required**, non-empty. `sudo`, `rm -rf /` and NUL bytes are rejected up front. |
| `useShell` | `boolean` | `false` | Run through a shell (`shell: true`). When `false` the command is spawned directly (no implicit shell). |
| `subdir` | `string` | — | Sub-directory of the workspace `cwd` to run in. Cannot escape the workspace (containment is enforced). |
| `env` | `Record<string, string>` | — | Extra environment variables, merged onto a filtered base env (secrets are not leaked by default). |
| `timeoutMs` | `number` | `60000` | Wall-clock timeout, clamped to `1000..600000`. |
| `maxOutputBytes` | `number` | `262144` | Output cap per stream; beyond it the stream is truncated (a `truncated` flag is recorded). Minimum `1024`. |
| `stdin` | `string` | — | Text written to the child's stdin. |
| `exitCodes` | `object` | — | Maps named ports → exit codes (e.g. `{ "ok": [0], "rebase": [1], "other": "*" }`). At least 2 ports; exactly one must be the catch-all `"*"`; each code appears at most once. Port names `stdout`/`stderr` are reserved. |

## Runtime behavior

1. The runner parses the config (throws on an empty/invalid `command`, a bad `exitCodes` map, etc.) and enforces the guards (`sudo`, `rm -rf /`, NUL byte).
2. It resolves the `cwd` from the workspace (error if none — place a [Workspace Set](/en/nodes/workspace-set/) or [Git Worktree Create](/en/nodes/git-worktree-create/) upstream) and, when `subdir` is set, asserts it stays inside the workspace.
3. It builds a filtered environment (merging `env`) and spawns the command (with or without a shell per `useShell`), bounded by `timeoutMs`.
4. It captures `stdout`/`stderr`, truncating each at `maxOutputBytes`.
5. It selects the branch port: default `success` (exit 0) / `failure` (otherwise), or the matching named port from `exitCodes` (falling back to the catch-all; timeout/signal route through it too).
6. It emits exactly one branch port plus the always-present `stdout` and `stderr` (each a `Markdown` artifact with `exitCode`, `signal`, `durationMs`, `truncated`, `cwd` metadata).

## Example

Run a test suite and branch on the outcome:

- `command`: e.g. `["npm", "test"]`, with a [Workspace Set](/en/nodes/workspace-set/) upstream supplying the `cwd`.
- `success` → continue the flow; `failure` → [Human Gate](/en/nodes/human-gate/) for a human to inspect.
- Wire `stdout` (or `stderr`) into a [Claude Code Invoke](/en/nodes/claude-code-invoke/) so the agent can read the logs.

With `exitCodes` set to `{ "ok": [0], "lint": [1], "other": "*" }`, the node exposes `ok`, `lint`, `other` instead of `success`/`failure`.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Workspace Set](/en/nodes/workspace-set/) — sets the `cwd` this node runs in.
- [Git Worktree Create](/en/nodes/git-worktree-create/) — an alternative source of the `cwd`.
- [Git Commit & Push](/en/nodes/git-commit-push/) — another `cwd`-dependent node that branches on its outcome.
