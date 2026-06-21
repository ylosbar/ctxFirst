---
title: Format Validate
description: The Format Validate node — validates an artifact against an artifact-kind schema and routes approved/rejected/exhausted.
---

`format.validate`

**Format Validate** validates its `subject` input against the schema of a registered artifact kind (`config.expectedKind`) and routes to one of three ports — `approved`, `rejected`, or `exhausted`. It is the **deterministic** counterpart to [LLM Judge](/en/nodes/llm-judge/): same three-port shape and same auto-loop wiring, but no LLM — the verdict comes from a schema check, not a model.

![The Format Validate node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `subject` | `*` | **Required**, primary. The artifact to validate. For envelope kinds the `body` is checked; for structured kinds the serialized content is. A leading Markdown code fence is stripped first. |
| Output | `approved` | `config.approvedKind` | Subject passed through unchanged when the format is valid. Defaults to `Markdown`. |
| Output | `rejected` | `Markdown` | Validation feedback (summary + one comment per schema issue) when invalid and attempts remain. An `isLoop` transition on this port drives the auto-loop. |
| Output | `exhausted` | `Markdown` | Same feedback, emitted when attempts are spent. Typically wired to a [Human Gate](/en/nodes/human-gate/). |

Exactly one port fires per run. The `rejected` feedback is rendered in the judge format so the orchestrator's auto-loop re-injects it unchanged on the next attempt.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `expectedKind` | `string` | — | The registered artifact kind to validate against. **Required** — the runner throws if missing or empty. An unknown kind is a config error (it surfaces as a failed step, not a rejection loop). |
| `maxAttempts` | `number` | `3` | Number of attempts before routing to `exhausted`. Must be a positive integer. |
| `approvedKind` | `string` | `Markdown` | Kind announced on the `approved` port. Must be non-empty when set. |

## Runtime behavior

1. The runner reads `expectedKind` (error if missing) and `maxAttempts`, and checks the artifact-schema registry is available.
2. It reads the `subject` (error if absent), extracting the body for envelope kinds (else the serialized content) and stripping a leading code fence.
3. It validates that string against `expectedKind`'s schema.
4. If valid → it re-emits the original subject artifact unchanged on `approved`.
5. If invalid → it renders feedback (summary + one comment per schema issue) and routes to `rejected` while attempts remain (`attempt < maxAttempts - 1`), or to `exhausted` once spent.
6. An unknown `expectedKind` is thrown as a configuration error rather than looping forever.

## Example

Gate a generated artifact on its shape before publishing:

- `subject` ← the output of a [Claude Code Invoke](/en/nodes/claude-code-invoke/), `expectedKind`: the kind it must conform to.
- `approved` → continue the flow; `rejected` → loop back to the producing node (mark the transition `isLoop`) so it retries with the feedback; `exhausted` → [Human Gate](/en/nodes/human-gate/).

## See also

- [Nodes overview](/en/nodes/overview/)
- [LLM Judge](/en/nodes/llm-judge/) — the LLM-based sibling with the same approved/rejected/exhausted routing.
- [Claude Code Judge](/en/nodes/claude-code-judge/) — the agentic judge variant.
- [Human Gate](/en/nodes/human-gate/) — typical target of the `exhausted` port.
