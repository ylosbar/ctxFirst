---
title: LLM Judge
description: The LLM Judge node — evaluates an input artifact against acceptance criteria and routes to approved, rejected, or exhausted.
---

`llm.judge`

**LLM Judge** evaluates its `subject` input against the acceptance criteria in `config.judgePrompt`, asks an LLM for a structured JSON verdict, and routes the result to one of three ports — `approved`, `rejected`, or `exhausted`. Wiring an `isLoop` transition out of the `rejected` port turns the judge into a **bounded retry loop**: a rejection re-invokes the upstream step (up to `maxAttempts`).

Place it downstream of a node whose output needs validating (e.g. a [Claude Code Invoke](/en/nodes/claude-code-invoke/)), with `rejected` looping back and `exhausted` escalating to a [Human Gate](/en/nodes/human-gate/).

![The LLM Judge node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `subject` | `*` | **Primary**, required. The artifact being judged; its content is sent to the LLM. |
| Output | `approved` | `config.approvedKind` (default `Markdown`) | Verdict is approved: the subject is re-emitted unchanged (pass-through). |
| Output | `rejected` | `Markdown` | Verdict is rejected and attempts remain: judge feedback (summary + comments). Wire an `isLoop` transition here for the auto-loop. |
| Output | `exhausted` | `Markdown` | Same feedback as `rejected`, emitted when no attempts remain. Typically wired to a human gate. |

Only the produced port fires; steps wired to the other ports are skipped in cascade.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `judgePrompt` | `string` | `""` | Acceptance criteria sent to the LLM. **Required** — the runner throws if empty or blank. |
| `model` | `string` | `claude-haiku-4-5` | Model used for the verdict. |
| `maxAttempts` | `number` | `3` | Max judge attempts (1-indexed). Must be a positive integer; `exhausted` fires once `attempt >= maxAttempts - 1`. |
| `approvedKind` | `string` (ArtifactKind) | `Markdown` | Kind declared on the `approved` port. Must be a non-empty string when set. |

## Runtime behavior

1. Reads `judgePrompt` (error if empty), `model`, and `maxAttempts`; requires a `subject` input.
2. Builds a prompt (criteria + subject + JSON output instructions) and invokes the LLM in **streaming** mode, recording a **run-log** row.
3. Parses the JSON verdict (`approved` / `rejected`, plus a summary and optional line-anchored comments).
4. On **approved**: re-emits the original subject artifact unchanged on `approved` (pass-through).
5. On **rejected**: renders the feedback as Markdown and routes to `exhausted` when `attempt >= maxAttempts - 1`, otherwise to `rejected`.
6. The loop itself (re-invoking the upstream step on `rejected`) is driven by the orchestrator via the `isLoop` transition — the runner is loop-agnostic.

## Example

Validate generated output with a bounded retry loop:

- Input `subject` ← output of a [Claude Code Invoke](/en/nodes/claude-code-invoke/); `judgePrompt`: the acceptance criteria; `maxAttempts`: `3`.
- `approved` → continue the flow; `rejected` → loop back to the generator (via an `isLoop` transition); `exhausted` → [Human Gate](/en/nodes/human-gate/).

## See also

- [Nodes overview](/en/nodes/overview/)
- [Claude Code Judge](/en/nodes/claude-code-judge/) — the agentic, Skill-driven judge variant.
- [Claude Code Invoke](/en/nodes/claude-code-invoke/) — a typical generator whose output is judged here.
- [Human Gate](/en/nodes/human-gate/) — typical target of the `exhausted` port.
