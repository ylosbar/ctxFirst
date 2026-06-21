---
title: Load Markdown File
description: The Load Markdown File node — reads a Markdown file at an absolute path and exposes it as a Markdown artifact.
---

`file.load-markdown`

**Load Markdown File** reads a Markdown file at an absolute path (`config.path`) and exposes its content as a `Markdown` artifact on `out`. It is the non-polymorphic, Markdown-only sibling of [Load File](/en/nodes/file-load/): no output kind to pick, always `Markdown`.

This kind is a **deprecated alias** kept so existing persisted templates keep working — it delegates to the same shared core as `file.load`. New workflows should use [Load File](/en/nodes/file-load/) with `outputKind = Markdown`, which also supports a dynamic `path` input.

![The Load Markdown File node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `*` | **Optional**. Available for chaining (e.g. ordering) but not consumed — the path comes from `config.path`, never from this port. |
| Output | `out` | `Markdown` | Primary. The file content wrapped as a `Markdown` text-envelope (`{ format, body }`). |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `path` | `string` | `""` | Absolute path of the Markdown file to read. **Required** — the runner throws if it is missing or blank. |

## Runtime behavior

1. The runner reads `config.path`, trims it, and throws if it is empty.
2. It delegates to the shared `file.load` core with `outputKind = Markdown`.
3. It asserts the path is **absolute** (error otherwise) and reads the file (error if empty).
4. It stores the artifact (`{ format, body }`) with `source`, `path`, and `byteLength` metadata, and produces it on `out`.

## Example

Load a Markdown spec from disk and feed it to an agent:

- `path`: the absolute path of the Markdown file.
- Output `out` (`Markdown`) → input of a downstream [Claude Code Invoke](/en/nodes/claude-code-invoke/).

## See also

- [Nodes overview](/en/nodes/overview/)
- [Load File](/en/nodes/file-load/) — the polymorphic successor; pick `Markdown` or `Json` and wire a dynamic `path`.
- [Load Files](/en/nodes/files-load/) — reads several files under a base directory at once.
