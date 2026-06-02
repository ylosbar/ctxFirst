---
title: Skill Loader
description: The Skill Loader node — loads a saved skill (prompt) and exposes its body as a Markdown artifact.
---

`skill.loader`

**Skill Loader** resolves a **skill** (a _prompt_ persisted in the library) referenced by its config, and exposes its `body` as a `Markdown` artifact on the `out` port.

It is typically used to wire a reusable prompt upstream of a `claude_code.invoke` node (or another agent) that consumes this Markdown as input. The node is **decoupled** from the agent: no config-level dependency — the connection is made through the workflow's transitions.

![The Skill Loader node in the workflow studio](../../../../assets/nodes/skill-loader.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `*` | **Optional**, not consumed. Available for chaining (e.g. behind a `workspace.set` passthrough). |
| Output | `out` | `Markdown` | Primary port: the resolved skill's `body`. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `skillRef` | `string` | `""` | Reference of the skill to load from the library. **Required** — the runner fails if empty. |

## Runtime behavior

1. The runner reads `config.skillRef` (error if empty or missing).
2. It resolves the skill through the `SkillRegistry` (`ctx.deps.skills`) — error if the registry is not wired.
3. It builds a `Markdown` payload from the skill's `body`.
4. It stores the payload and produces the artifact on `out`, with `source: "skill.loader"`, `skillRef`, and `byteLength` metadata.

## Example

Load a "code review" prompt and send it to an agent:

- `skillRef`: the reference of the desired skill.
- Output `out` (`Markdown`) → wired to the input of a downstream `claude_code.invoke` node.

## See also

- [Nodes overview](/en/nodes/overview/)
- [User Input](/en/nodes/user-input/) — the other source node (user entry rather than a library prompt).
