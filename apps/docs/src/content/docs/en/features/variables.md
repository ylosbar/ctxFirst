---
title: Template variables
description: How {{variable}} placeholders in Markdown templates and skill bodies become input ports hydrated from upstream.
---

Several nodes treat a Markdown string as a **template**: every `{{variable}}` placeholder it contains becomes an optional input port, and the value wired into that port is substituted into the text at run time. This is how a workflow assembles a parametrized prompt from upstream fragments.

The same mechanism powers two nodes:

- [Markdown Template](/en/nodes/markdown-template/) — the template lives inline in `config.template`.
- [Skill Loader](/en/nodes/skill-loader/) — the template is the resolved **skill body** (a prompt saved in the library).

This page describes the shared placeholder grammar, port derivation, and the `onMissing` policy.

## Placeholder syntax

A placeholder is written `{{name}}`. The name must match the grammar `^[a-zA-Z_][a-zA-Z0-9_]*$` — a letter or underscore first, then letters, digits, or underscores. Whitespace **inside** the braces is tolerated, so `{{ spec }}` and `{{spec}}` are the same variable. Anything that does not match (e.g. `{{1abc}}`, `{{a-b}}`) is left untouched as literal text.

Distinct placeholders are collected in **order of first appearance** and **deduplicated**. The template `{{a}} x {{ b }} {{a}}` declares two variables — `a` and `b` — and `a` is substituted in both spots.

## From placeholder to port

Each distinct placeholder declares one **optional** input port, named exactly after the placeholder (the port name **is** the variable name), accepting `Markdown` or `Json`.

The substituted value is the wired payload's `body`, falling back to its raw content. A `Json` value therefore inserts its `body` field — handy to drop a JSON example into a prompt.

Every templating node also exposes an optional `in` port (kind `*`) reserved for **control-flow chaining** (e.g. behind a [Workspace Set](/en/nodes/workspace-set/) passthrough). It is never substituted into the template. A literal `{{in}}` placeholder **shadows** that chaining port, turning `in` into a value port.

With an empty template (no placeholders), the node degrades to the permissive `in`-only signature, so it stays pickable in the editor.

## Missing values — `onMissing`

When a placeholder has no wired value at run time, the `onMissing` config decides what happens:

| Value | Behavior |
| --- | --- |
| `empty` _(default)_ | The placeholder is dropped from the output (replaced by an empty string). |
| `keep` | The placeholder is left as the literal `{{name}}` in the output. |
| `error` | The run fails, listing the unresolved placeholders. |

Whatever the policy, the unresolved placeholder names are recorded on the output artifact's `missing` metadata (comma-separated), so a downstream consumer or the run inspector can see which variables were left unwired.

## Where variables apply

| | [Markdown Template](/en/nodes/markdown-template/) | [Skill Loader](/en/nodes/skill-loader/) |
| --- | --- | --- |
| Template source | `config.template` (inline) | the resolved skill `body` |
| Editing the template | edit `config.template` | edit the skill in the library |
| Dependency | none (self-contained) | the skill registry |

In both cases the input ports are derived from the placeholders found in the template, so adding or removing a `{{variable}}` adds or removes the matching port.

## Example

Build a parametrized review prompt:

- Template: `Review the spec {{spec}} against {{rules}}.`
- Wire `spec` ← a [Load File](/en/nodes/file-load/) producing `Markdown`, and `rules` ← another upstream `Markdown` source.
- Set `onMissing` to `error` to fail fast if a variable is left unwired.
- Output `out` (`Markdown`) → input of a downstream [Claude Code Invoke](/en/nodes/claude-code-invoke/).

## See also

- [Markdown Template](/en/nodes/markdown-template/) — `{{variables}}` in an inline template stored in config.
- [Skill Loader](/en/nodes/skill-loader/) — the same templating, but the body comes from a saved skill.
- [Concat Markdown](/en/nodes/concat-markdown/) — concatenates fragments rather than substituting named placeholders.
- [Render Markdown](/en/nodes/render-markdown/) — projects a typed artifact into Markdown you can wire into a variable port.
- [Kinds](/en/type-system/kinds/) — the `Markdown` / `Json` kinds a variable port accepts, and the wider type system.
