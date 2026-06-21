---
title: Markdown Template
description: The Markdown Template node — an inline Markdown template whose {{variables}} become input ports hydrated from upstream.
---

`markdown.template`

**Markdown Template** treats an inline string (`config.template`) as a Markdown template: each `{{variable}}` becomes an optional `Markdown | Json` input port whose wired value is substituted, and the resulting Markdown is exposed on the `out` port. It is the standalone successor of `concat.markdown`'s `template` mode.

Unlike [Skill Loader](/en/nodes/skill-loader/) — which reads its template from a saved skill — the template lives in the config, so the node has no injected dependency. The port name **is** the placeholder name (no `readsFrom` to apply).

![The Markdown Template node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `*` | **Optional**, not consumed. Chaining port (e.g. behind a [Workspace Set](/en/nodes/workspace-set/) passthrough). Hidden if a literal `{{in}}` placeholder shadows it. |
| Input | `{{variable}}` | `Markdown`, `Json` | One **optional** port per distinct placeholder in `template`, in order of first appearance. The wired value (payload `body`, falling back to raw content) replaces the placeholder. |
| Output | `out` | `Markdown` | Primary port: the substituted Markdown. |

With an empty `template` (including the catalogue call with `config = {}`) the node degrades to the permissive `in`-only signature, so it stays pickable in the editor.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `template` | `string` | `""` | The inline Markdown template. Each `{{variable}}` (grammar `^[a-zA-Z_][a-zA-Z0-9_]*$`, surrounding whitespace tolerated) declares an input port. |
| `onMissing` | `"keep"` \| `"empty"` \| `"error"` | `"empty"` | Policy for a placeholder with no wired value: `keep` leaves it literal, `empty` drops it from the output, `error` fails the run. |

## Runtime behavior

1. The runner reads `config.template` (defaults to `""`) and `config.onMissing` (defaults to `empty`).
2. It builds a value map keyed by **port name** (= placeholder name); the `in` chaining port is skipped (it carries control-flow, not a value).
3. Each `{{name}}` is substituted by its wired value according to `onMissing`.
4. The resulting Markdown is stored on `out` with `source: "markdown.template"` and `missing` (the unresolved placeholder names) metadata.

## Example

Build a parametrized prompt from upstream fragments:

- `template`: `Review the spec {{spec}} against {{rules}}.`
- Wire `spec` ← a [Load File](/en/nodes/file-load/) producing `Markdown`, and `rules` ← another upstream `Markdown` source.
- `onMissing`: `error` to fail fast if a variable is left unwired.
- Output `out` (`Markdown`) → input of a downstream [Claude Code Invoke](/en/nodes/claude-code-invoke/).

## See also

- [Nodes overview](/en/nodes/overview/)
- [Template variables](/en/features/variables/) — the shared `{{variable}}` placeholder grammar and `onMissing` policy.
- [Concat Markdown](/en/nodes/concat-markdown/) — its sibling; concatenates fragments rather than substituting named placeholders.
- [Render Markdown](/en/nodes/render-markdown/) — projects a typed artifact into Markdown you can feed into a port.
- [Skill Loader](/en/nodes/skill-loader/) — the same templating shape, but reading the body from a saved skill.
