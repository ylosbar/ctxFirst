---
title: Skill Loader
description: The Skill Loader node — loads a saved skill (prompt) and exposes its body as a Markdown artifact.
---

`skill.loader`

**Skill Loader** resolves a **skill** (a _prompt_ persisted in the library) referenced by its config, treats its `body` as a Markdown template, and exposes the hydrated result as a `Markdown` artifact on the `out` port. Each `{{variable}}` placeholder in the body becomes an optional input port substituted from upstream — see [Template variables](/en/features/variables/) for the shared placeholder mechanism.

It is typically used to wire a reusable prompt upstream of a `claude_code.invoke` node (or another agent) that consumes this Markdown as input. The node is **decoupled** from the agent: no config-level dependency — the connection is made through the workflow's transitions.

![The Skill Loader node in the workflow studio](../../../../assets/nodes/skill-loader.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `*` | **Optional**, not consumed. Available for chaining (e.g. behind a `workspace.set` passthrough). Shadowed if the skill body has a literal `{{in}}` placeholder. |
| Input | `{{variable}}` | `Markdown`, `Json` | One **optional** port per distinct placeholder in the skill `body`, in order of first appearance. The wired value (payload `body`, falling back to raw content) replaces the placeholder. Editing the skill changes the ports. |
| Output | `out` | `Markdown` | Primary port: the resolved skill's `body`, with placeholders substituted. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `skillRef` | `string` | `""` | Reference of the skill to load from the library. **Required** — the runner fails if empty. |
| `onMissing` | `"keep"` \| `"empty"` \| `"error"` | `"empty"` | Policy for a placeholder with no wired value: `keep` leaves it literal, `empty` drops it from the output, `error` fails the run. See [Template variables](/en/features/variables/). |

## Runtime behavior

1. The runner reads `config.skillRef` (error if empty or missing) and `config.onMissing` (defaults to `empty`).
2. It resolves the skill through the `SkillRegistry` (`ctx.deps.skills`) — error if the registry is not wired.
3. It builds a value map keyed by **port name** (= placeholder name); the `in` chaining port is skipped.
4. It hydrates the skill's `body`, substituting each `{{name}}` according to `onMissing`, and builds a `Markdown` payload.
5. It stores the payload and produces the artifact on `out`, with `source: "skill.loader"`, `skillRef`, `missing` (the unresolved placeholder names), and `byteLength` metadata.

## Example

Load a "code review" prompt and send it to an agent:

- `skillRef`: the reference of the desired skill.
- Output `out` (`Markdown`) → wired to the input of a downstream `claude_code.invoke` node.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Template variables](/en/features/variables/) — the shared `{{variable}}` placeholder mechanism.
- [Markdown Template](/en/nodes/markdown-template/) — the same templating, but the template lives inline in the config.
- [User Input](/en/nodes/user-input/) — the other source node (user entry rather than a library prompt).
