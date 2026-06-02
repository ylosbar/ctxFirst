---
title: Load File
description: The Load File node — reads a single file at an absolute path and exposes it as a typed artifact.
---

`file.load`

**Load File** reads a single text file and exposes its content as an artifact of the kind you choose (`config.outputKind`, polymorphic). The path comes from the `path` input port or from `config.path` — the input wins when both are present (same pattern as `webhook.call` for the URL). No upstream [Workspace Set](/en/nodes/workspace-set/) is required: the path must be **absolute**.

A file's content is text, so only **text-envelope** kinds (`{ format, body }`) make sense on the output: **Markdown** and **Json**. For `Json`, the body is parsed at load time to fail early on malformed JSON.

![The Load File node in the workflow studio](../../../../assets/nodes/file-load.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `path` | `Path`, `String`, `Markdown`, `*` | **Optional**, primary. When wired it overrides `config.path`. The path is read from the payload (`Path` → `path`, scalar `String` → `value`, text envelope → `body`) with a fallback on the raw content. |
| Output | `out` | `config.outputKind` | Primary. The file content serialized into the chosen kind. No output port appears until `outputKind` is set. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` (`Markdown` \| `Json`) | — | Kind of the produced artifact. **Required** — the runner fails if missing or unsupported. |
| `path` | `string` | — | Absolute path of the file to read. Used only when the `path` input is not wired. |

## Runtime behavior

1. The runner reads `config.outputKind` (error if missing, or not `Markdown`/`Json`).
2. It resolves the path: `path` input if wired, otherwise `config.path` (error if neither is set).
3. It asserts the path is **absolute** (error otherwise) and reads the file (error if empty).
4. For `Json`, it parses the body to fail early on invalid JSON.
5. It stores the artifact (`{ format, body }`) with `source`, `path`, and `byteLength` metadata, and produces it on `out`.

## Example

Load a Markdown spec from disk and feed it to an agent:

- `outputKind`: `Markdown`, `path`: the absolute path of the file (or wire the `path` input).
- Output `out` (`Markdown`) → input of a downstream [Claude Code Invoke](/en/nodes/claude-code-invoke/).

## See also

- [Nodes overview](/en/nodes/overview/)
- **Load Files** (`files.load`) — the multi-file variant (reads N files under a base directory).
- [Git Clone](/en/nodes/git-clone/) — produces a `Path` you can wire into the `path` input.
