---
title: Load Files (manifest)
description: The Load Files (manifest) node — reads files named in a JSONPath array and emits their wrapped concatenation as one Markdown.
---

`files.load-manifest`

**Load Files (manifest)** reads N files whose names are computed **at run time** from the input `source`: a JSON document on which a JSONPath `selector` selects an array of file names (strings). Each name is resolved under the base directory (`path` input) plus an optional `subdir`, read, wrapped with a per-file header/footer, and the results are concatenated into a single `Markdown` artifact on `out`.

An empty selector match produces an empty (but valid) Markdown — never an error. The node **always produces** `out` (no dead port), so it wires cleanly into a downstream [Loop Foreach](/en/nodes/loop-foreach/) or [Concat Markdown](/en/nodes/concat-markdown/). Each resolved name is containment-checked against the base (no escape). It is deterministic — no LLM.

![The Load Files (manifest) node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `source` | `*` | **Required**, primary. JSON document parsed at run time (a leading code fence is tolerated) and queried by `selector` to get the file names. |
| Input | `path` | `Path`, `String`, `Markdown`, `*` | **Optional**. The base directory (`Path` → `path`, scalar `String` → `value`, text envelope → `body`, fallback raw content). **Required at run time** — the runner throws if no base is provided. |
| Output | `out` | `Markdown` | Primary. The wrapped concatenation of all read files (empty string when nothing matched). |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `selector` | `string` | `"$.files[*]"` | JSONPath evaluated on `source`; must yield an array of strings (a non-string match fails the step). 0 matches is valid. |
| `subdir` | `string` | `""` | Relative subdirectory under the base, prepended to each file name. |
| `outputKind` | `string` (`Markdown` \| `Json`) | `Json` | Kind used to validate each read file (`Json` is parsed to fail early). The concatenated output is always `Markdown`. |
| `wrap.header` | `string` | `'<file name="{name}">'` | Inserted before each file's body. `{name}` is substituted with the file name. |
| `wrap.footer` | `string` | `"</file>"` | Inserted after each file's body. `{name}` is substituted with the file name. |
| `separator` | `string` | `"\n\n"` | Joins the wrapped segments. |
| `dedupe` | `boolean` | `true` | When true, duplicate names are read once. |
| `onMissing` | `"fail"` \| `"skip"` | `"fail"` | `skip` tolerates a single unreadable file; any other failure (e.g. malformed JSON) is still a hard error. |
| `maxFiles` | `number` | — | If set (> 0), the step fails when the selector matches more names than this. |

## Runtime behavior

1. The runner reads `selector`, `subdir`, `outputKind`, `wrap`, `separator`, `dedupe`, `onMissing`, and `maxFiles` from config (defaults above).
2. It parses `source` as JSON (fence-stripped) and evaluates `selector` into an array of file names — a non-string match throws.
3. It deduplicates the names (unless `dedupe: false`) and throws if `maxFiles` is exceeded.
4. It resolves the base from the `path` input (error if missing) and asserts it is **absolute**.
5. For each name it computes `path.resolve(base, subdir, name)`, checks it stays inside the base, reads the file (`onMissing: "skip"` tolerates a read failure), skips empty bodies, validates + stores a per-file artifact (`byteLength`, `path` metadata), and appends `wrap.header + body + wrap.footer` (with `{name}` filled).
6. It joins the segments with `separator`, stores the result as `Markdown` on `out` (metadata `source`, `selector`, `count`), and emits `produced`.

## Example

Read every file listed by an upstream agent into one document:

- `source` (`Json`) ← e.g. `{ "files": ["a.md", "b.md"] }` from a [Claude Code Invoke](/en/nodes/claude-code-invoke/).
- `path` ← a `Path` from [Git Clone](/en/nodes/git-clone/); `subdir`: `"docs"`.
- Keep the default `wrap` to tag each file as `<file name="a.md">…</file>`.
- Output `out` (`Markdown`) → input of a downstream [Concat Markdown](/en/nodes/concat-markdown/).

## See also

- [Nodes overview](/en/nodes/overview/)
- [Load File](/en/nodes/file-load/) — reads a single file at an absolute path.
- [Load Files](/en/nodes/files-load/) — reads files from statically declared slots (one port each), not from a runtime manifest.
- [Select Markdown](/en/nodes/select-markdown/) — like this node's selector, but extracts exactly one match instead of an array.
