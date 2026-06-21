---
title: Concat Markdown
description: The Concat Markdown node — concatenates a main Markdown with up to three optional fragments into a single Markdown artifact.
---

`concat.markdown`

**Concat Markdown** assembles a main Markdown (`main`) with up to 3 optional additional fragments (`markdown1` / `markdown2` / `markdown3`, Markdown or JSON) to produce a single `Markdown` artifact on the `out` port. Its single responsibility is **concatenation** — placeholder substitution (`{{name}}`) lives in the dedicated [Markdown Template](/en/nodes/markdown-template/) node.

![The Concat Markdown node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `main` | `Markdown`, `Json` | **Primary port.** The first fragment. |
| Input | `markdown1` | `Markdown`, `Json` | **Optional.** Additional fragment. |
| Input | `markdown2` | `Markdown`, `Json` | **Optional.** Additional fragment. |
| Input | `markdown3` | `Markdown`, `Json` | **Optional.** Additional fragment. |
| Output | `out` | `Markdown` | Primary port: the assembled Markdown. |

For ports receiving `Json`, the payload's `body` field is used (falling back to the raw content otherwise) — handy for inserting a JSON example into a prompt. A wired port whose body is **empty** is skipped entirely (no fragment, no header/footer) — so a conditionally-empty upstream (e.g. a [Select (Markdown)](/en/nodes/select-markdown/) with a false flag) leaves no empty wrapper tags behind.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `separator` | `string` | `"\n\n"` | Separator inserted between segments. |
| `header` | `string` | `""` | Global text prepended to the output (when non-empty). |
| `footer` | `string` | `""` | Global text appended to the output (when non-empty). |
| `order` | `"top-to-bottom"` \| `"bottom-to-top"` | `"top-to-bottom"` | Order in which fragments are concatenated. |
| `entries.<port>.header` | `string` | `""` | Header inserted before the port's fragment (`main`, `markdown1`…). |
| `entries.<port>.footer` | `string` | `""` | Footer inserted after the port's fragment. |

## Runtime behavior

1. The runner reads `separator`, `header`, `footer` and `order`.
2. For each wired port in declaration order (`main`, `markdown1`, `markdown2`, `markdown3`), it extracts the body, skipping any port that is unwired or whose body is empty.
3. Each kept fragment is wrapped with its optional `entries.<port>.header` / `footer` (joined by `separator`).
4. If `order` is `bottom-to-top`, the fragment order is reversed.
5. The fragments are joined by `separator`, framed by the global `header` / `footer`, and stored as `Markdown` on `out` (metadata `source: "concat.markdown"`, `partCount`).

## Example

Concatenate a prompt and an example:

- `main` (`Markdown`) ← an instruction.
- `markdown1` (`Json`) ← an example of the expected payload.
- `entries.markdown1.header`: `` "## Example\n" `` to title the inserted fragment.
- Output `out` → input of a [Claude Code Invoke](/en/nodes/claude-code-invoke/) node.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Markdown Template](/en/nodes/markdown-template/) — substitute `{{variables}}` into an inline template (the home of the former `template` mode).
- [Select (Markdown)](/en/nodes/select-markdown/) — conditionally produce a fragment to feed into one of the inputs here.
