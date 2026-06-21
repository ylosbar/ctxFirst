---
title: Load Files
description: The Load Files node — reads several files under a base directory and exposes each on its own dynamic output port.
---

`files.load`

**Load Files** is the multi-file variant of [Load File](/en/nodes/file-load/). It takes one **base directory** (the `path` input or `config.path`, input wins) and a list of declared **slots** `{ port, subpath, outputKind }`. Each slot reads the file at `path.resolve(base, subpath)` and exposes it on **its own named output port**. The node produces every declared port in a single outcome.

It reuses the exact read/validate/store core of `file.load`: the same text-envelope kinds (`Markdown` | `Json`), the same absolute-path guard on the base, and the same early-fail JSON validation. Each `subpath` is also containment-checked — a slot may not escape the base directory.

![The Load Files node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `path` | `Path`, `String`, `Markdown`, `*` | **Optional**, primary. The base directory. When wired it overrides `config.path` (read as `Path` → `path`, scalar `String` → `value`, text envelope → `body`, with a fallback on the raw content). |
| Output | *(per slot)* | `slot.outputKind` | **Dynamic.** One output port per entry in `config.slots`, named after `slot.port`. The first slot is the primary port. No output ports appear until `slots` is valid. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `path` | `string` | `""` | Absolute base directory. Used only when the `path` input is not wired. |
| `slots` | `Array<{ port, subpath, outputKind }>` | `[{ port: "out", subpath: "", outputKind: "Markdown" }]` | **Required** — at least one slot, validated at run time (see below). |
| `slots[].port` | `string` | — | Output port name. Must match `^[a-zA-Z_][a-zA-Z0-9_-]*$` and be unique across slots. |
| `slots[].subpath` | `string` | `""` | Relative path under the base; **must be non-empty** and must stay inside the base. |
| `slots[].outputKind` | `string` (`Markdown` \| `Json`) | `Markdown` | Kind of the produced artifact for this slot. |

## Runtime behavior

1. The runner parses and validates `config.slots` — it throws if the array is empty, a slot is not an object, a port name is blank / invalid / duplicated, a `subpath` is empty, or an `outputKind` is unsupported.
2. It resolves the base directory: `path` input if wired, otherwise `config.path` (error if neither is set), and asserts the base is **absolute**.
3. For each slot it computes `path.resolve(base, subpath)` and checks the result stays inside the base (error if the subpath escapes it).
4. It reads each file, validates it (`Json` parsed to fail early), stores one artifact (`{ format, body }`) per file, and routes it to the slot's port.
5. It emits a single `produced-many` outcome covering all declared ports.

## Example

Load a prompt and an expected-output sample from the same directory:

- Wire `path` (a `Path` from [Git Clone](/en/nodes/git-clone/)) as the base directory, or set `config.path`.
- `slots`: `[ { port: "prompt", subpath: "docs/prompt.md", outputKind: "Markdown" }, { port: "schema", subpath: "schema.json", outputKind: "Json" } ]`.
- Output `prompt` (`Markdown`) → a [Claude Code Invoke](/en/nodes/claude-code-invoke/); output `schema` (`Json`) → a [Format Validate](/en/nodes/format-validate/).

## See also

- [Nodes overview](/en/nodes/overview/)
- [Load File](/en/nodes/file-load/) — the single-file variant this node generalizes.
- [Load Files (manifest)](/en/nodes/files-load-manifest/) — reads files whose names are computed at run time from a JSONPath array, concatenated into one Markdown.
- [Git Clone](/en/nodes/git-clone/) — produces a `Path` you can wire into the `path` input.
