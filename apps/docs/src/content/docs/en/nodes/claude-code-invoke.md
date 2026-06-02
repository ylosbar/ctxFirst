---
title: Claude Code Invoke
description: The Claude Code Invoke node — invokes a model using its input as the prompt.
---

`claude_code.invoke`

**Claude Code Invoke** invokes an LLM: it takes the value of its `prompt` input port, sends it to the model (streaming), and produces the output as a typed artifact on `out`.

It is a workflow's central "agent" node: wire a prompt upstream (e.g. via [Skill Loader](/en/nodes/skill-loader/) or [User Input](/en/nodes/user-input/)) and collect the model's result downstream.

![The Claude Code Invoke node in the workflow studio](../../../../assets/nodes/claude-code-invoke.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `prompt` | `*` | Polymorphic port: `inputs[0].content` is sent as the user prompt, whatever the kind. |
| Output | `out` | `config.outputKind` | The model's output, serialized into the target kind. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` (ArtifactKind) | `Markdown` | Kind of the produced artifact. **Required**. |
| `model` | `string` | `claude-opus-4-7` | Invoked model. |
| `maxTokens` | `number` | `8000` | Output token cap. |
| `actorRole` | `string` | `Developer` | Role assigned when a human validation is required (see below). |

## Runtime behavior

1. Reads the config (`model`, `maxTokens`, `outputKind`) — error if `outputKind` is missing, or if no value is present on `prompt`.
2. Assembles the prompt (input + loop history) via the _context assembler_.
3. Invokes the model in **streaming** mode: typed events are emitted on the session bus.
4. Serializes the output into `outputKind`, stores the artifact (with metadata: provider, tokens, latency, cost).
5. Records a **run-log** row (provider, model, tokens, cost, latency, output ref).
6. If the step has `humanGateRequired`, returns `produced-pending-human` (with `actorRole`); otherwise `produced`.

## Example

- `model`: `claude-opus-4-7`, `outputKind`: `Markdown`.
- Input `prompt` ← output of a [Skill Loader](/en/nodes/skill-loader/).
- Output `out` (`Markdown`) → input of a [Human Gate](/en/nodes/human-gate/) for validation.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Skill Loader](/en/nodes/skill-loader/) — provides a reusable prompt upstream.
- [Human Gate](/en/nodes/human-gate/) — validates the output downstream.
