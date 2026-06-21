---
title: Codex Invoke
description: The Codex Invoke node — invokes the Codex CLI (OpenAI) using its input as the prompt.
---

`codex.invoke`

**Codex Invoke** is the OpenAI counterpart of [Claude Code Invoke](/en/nodes/claude-code-invoke/): it takes the value of its `prompt` input port, sends it to the Codex CLI (streaming), and produces the model's output as a typed artifact on `out`. It is polymorphic on `outputKind` — the artifact is serialized into whichever kind you configure.

Wire a prompt upstream (e.g. via [Skill Loader](/en/nodes/skill-loader/) or [User Input](/en/nodes/user-input/)) and collect the result downstream.

![The Codex Invoke node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `prompt` | `*` | Polymorphic port: `inputs[0].content` is sent as the user prompt, whatever the kind. A value is required (the runner throws if `prompt` is empty). |
| Output | `out` | `config.outputKind` | The model's output, serialized into the target kind. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` (ArtifactKind) | `Markdown` | Kind of the produced artifact. **Required** — the runner throws if it is not a string. |
| `model` | `string` | `gpt-5-codex` | Invoked Codex model. |
| `maxTokens` | `number` | `8000` | Output token cap. |
| `actorRole` | `string` | `Developer` | Role assigned when a human validation is required (see below). |

## Runtime behavior

1. Reads the config (`model`, `maxTokens`, `outputKind`) — error if `outputKind` is missing, or if no value is present on `prompt`.
2. Assembles the prompt (input + loop history) via the _context assembler_.
3. Invokes the Codex CLI in **streaming** mode: typed events are emitted on the session bus.
4. Serializes the output into `outputKind`, stores the artifact (with metadata: model, provider, tokens, latency, cost).
5. Records a **run-log** row (provider, model, tokens, cost, latency, output ref).
6. If the step has `humanGateRequired`, returns `produced-pending-human` (with `actorRole`); otherwise `produced`.

## Example

- `model`: `gpt-5-codex`, `outputKind`: `Markdown`.
- Input `prompt` ← output of a [Skill Loader](/en/nodes/skill-loader/).
- Output `out` (`Markdown`) → input of a [Human Gate](/en/nodes/human-gate/) for validation.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Claude Code Invoke](/en/nodes/claude-code-invoke/) — the Anthropic sibling invoke node.
- [OpenRouter Invoke](/en/nodes/openrouter-invoke/) — invoke a model through OpenRouter.
- [Skill Loader](/en/nodes/skill-loader/) — provides a reusable prompt upstream.
