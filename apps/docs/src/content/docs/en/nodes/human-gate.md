---
title: Human Gate
description: The Human Gate node — pauses the workflow until a human validates the upstream artifact.
---

`human.gate`

**Human Gate** is a **human checkpoint**: it pauses the workflow until someone validates the artifact produced upstream. It is the mechanism behind the product's "human validations at key moments".

![The Human Gate node in the workflow studio](../../../../assets/nodes/human-gate.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `artifact` | `config.inputKind` | The artifact to validate. The expected kind is set by the config. |
| Output | — | — | No output port: the node produces no artifact, it carries a flow decision. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `inputKind` | `string` (ArtifactKind) | `Markdown` | Kind of the artifact the node pauses on. **Required**. |
| `role` | `string` | `Developer` | Role of the actor expected for validation. |
| `prompt` | `string` | `Valider ou demander un ajustement.` | Instruction shown to the human. |

## Runtime behavior

1. The runner reads `config.inputKind` (spec resolution) and `config.role`.
2. On `run`, it immediately returns `awaiting-human` with the `role` — the workflow pauses.
3. Resumption is driven by the human interaction (approve or request an adjustment / feedback loop), outside the runner.

:::note
Unlike a `claude_code.invoke` node with `humanGateRequired`, which first **produces** an artifact then waits (`produced-pending-human`), Human Gate is a dedicated node: it produces nothing, it only **blocks** on the upstream artifact.
:::

## Example

- `inputKind`: `Markdown`, `role`: `Developer`.
- Input `artifact` ← output of a [Claude Code Invoke](/en/nodes/claude-code-invoke/).
- The workflow waits for validation before continuing to the next nodes.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Claude Code Invoke](/en/nodes/claude-code-invoke/) — produces the artifact submitted for validation.
