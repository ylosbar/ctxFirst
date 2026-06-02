---
title: User Input
description: The User Input node — a workflow's entry point, capturing the seed provided by the user.
---

`user.input`

**User Input** is a workflow's **entry point**: it captures the _seed_ (the starting data) provided by the user and emits it as a typed artifact, ready to feed the downstream nodes.

It is typically the first node of a template: the input pasted by the user (spec, brief, URL…) becomes the run's first artifact.

![The User Input node in the workflow studio](../../../../assets/nodes/user-input.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | — | — | No wired input port: the value comes from the user's entry. |
| Output | `out` | `config.outputKind` | The kind of the produced artifact, set by the config. |

The node does not consume an upstream artifact: it sits at the head of the chain. The data provided by the user is serialized according to `outputKind`, then emitted on the `out` port.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` (ArtifactKind) | `Markdown` | Kind of the emitted artifact. **Required** — the runner fails if missing. |

- For a **builtin kind** (e.g. `Markdown`, `Json`…), the raw entry is converted through the kind's serializer.
- For a **custom kind**, the entry must be **valid JSON** matching the kind's payload; otherwise execution fails with a serialization error.

## Runtime behavior

1. The runner reads `config.outputKind` (error if missing).
2. It retrieves the user entry (error if no input is provided).
3. It serializes the string into the target kind's payload (`serializeFromString`).
4. It stores the payload and produces the artifact on `out` (with `sourceKind` = the entry's kind).

## Example

First node of a spec workflow: the user pastes a Markdown brief.

- `outputKind`: `Markdown`
- Output `out` → a `Markdown` artifact consumed by a downstream `claude_code.invoke` node.

## See also

- [Nodes overview](/en/nodes/overview/)
- **Human Gate** (`human.gate`) — the validation-side counterpart: a human checkpoint in the flow.
