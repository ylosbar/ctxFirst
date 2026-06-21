---
title: OpenRouter Invoke
description: The OpenRouter Invoke node — calls an OpenRouter chat-completion model with an optional Skill as system context.
---

`openrouter.invoke`

**OpenRouter Invoke** calls an OpenRouter chat-completion model: it concatenates an optional configured Skill body with its `prompt` input, sends a single-shot (non-streaming) request, and stores the response as a typed artifact on `out`. It is polymorphic on `outputKind`, but currently only the `Markdown` envelope kind is supported.

Wire a prompt upstream (e.g. via [Skill Loader](/en/nodes/skill-loader/) or [Concat Markdown](/en/nodes/concat-markdown/)) and collect the result downstream.

![The OpenRouter Invoke node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `prompt` | `*` | Polymorphic port. Multiple incoming inputs are concatenated (`\n\n`) into the user message. Either the prompt or the configured Skill body must be non-empty — the runner throws otherwise. |
| Output | `out` | `config.outputKind` | The model response, stored as the chosen artifact kind. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` (ArtifactKind) | `Markdown` | Kind of the produced artifact. Must be a supported text-envelope kind (`Markdown`) — the runner throws otherwise. |
| `model` | `string` | `openai/gpt-4o-mini` | OpenRouter model slug. Falls back to the user's configured default model when unset. |
| `maxTokens` | `number` | `4000` | Output token cap. Used when the value is a positive number, otherwise `4000`. |
| `skillRef` | `string` | — | **Optional.** Reference of a Skill whose body is prepended as system context. The runner throws if a ref is set but the skills registry is unavailable. |
| `actorRole` | `string` | `Developer` | Role assigned when a human validation is required (see below). |

## Runtime behavior

1. Reads `outputKind` (validated against the supported text-envelope kinds), `model` (falls back to the default), and `maxTokens`.
2. If `skillRef` is set, resolves the Skill and uses its `body` as system context (error if the skills registry is missing).
3. Concatenates the non-empty incoming `prompt` inputs into the user message; throws if both the Skill body and the prompt are empty.
4. Calls OpenRouter in **single-shot** (no streaming) mode; throws if the response is empty.
5. Stores the response as a `Markdown`-envelope artifact at `outputKind` (metadata: `source`, `skillRef`, model, `modelUsed`, provider, tokens, latency).
6. Records a **run-log** row, then returns `produced` — or `produced-pending-human` (with `actorRole`) when `humanGateRequired`.

## Example

- `model`: `openai/gpt-4o-mini`, `outputKind`: `Markdown`.
- Input `prompt` ← output of a [Skill Loader](/en/nodes/skill-loader/) or [Concat Markdown](/en/nodes/concat-markdown/).
- Output `out` (`Markdown`) → input of a [Human Gate](/en/nodes/human-gate/) for validation.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Codex Invoke](/en/nodes/codex-invoke/) — the OpenAI Codex CLI invoke node.
- [Claude Code Invoke](/en/nodes/claude-code-invoke/) — the Anthropic invoke node.
- [Skill Loader](/en/nodes/skill-loader/) — provides a reusable prompt upstream.
