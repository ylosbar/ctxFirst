---
title: Branch
description: The Branch node — routes the workflow to one of N branches based on a Markdown verdict.
---

`branch.bool`

**Branch** reads the trimmed `body` of its Markdown input as a _verdict_ and routes the run to exactly one of N output ports — one port per entry in `config.cases`. The matching port re-emits the input artifact unchanged; the other ports never fire, so the orchestrator cascades a skip over downstream steps reachable only through them.

Wire it after a node that emits a small, controlled verdict string (e.g. an [LLM Judge](/en/nodes/llm-judge/) verdict or a [Format Validate](/en/nodes/format-validate/) result), then attach distinct downstream paths to each case port.

![The Branch node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `verdict` | `Markdown` | **Required**, primary. Its `body.trim()` is the verdict compared against the cases. |
| Output | `<case>` | `inputKind` | One output port per entry in `config.cases`. Fires when the verdict equals that case label. |

The input artifact is re-emitted unchanged on the chosen port (no new bytes written). Outputs default to the `Markdown` kind unless `inputKind` overrides it.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `cases` | `string[]` | `["true", "false"]` | **Required.** ≥2 unique labels, each matching `/^[a-zA-Z_][a-zA-Z0-9_-]*$/` (used as port names). Each becomes one output port. |
| `inputKind` | `string` | `Markdown` | Artifact kind declared on the output ports (passthrough kind). |

## Runtime behavior

1. The runner validates `config.cases` (≥2 unique, port-name-safe labels — throws otherwise).
2. It reads the artifact on `verdict` (error if missing or not `Markdown`), then takes `body.trim()` as the verdict.
3. It finds the case whose label equals the verdict (error if none match).
4. It loads the input artifact's meta and re-emits it unchanged (`produced-on-port`) on the matching port. Steps wired only to the other ports are skipped in cascade.

## Example

Route on a yes/no judge verdict:

- `verdict` (`Markdown`) ← an upstream node that emits exactly `pass` or `fail`.
- `cases`: `["pass", "fail"]`.
- `pass` → continue the flow; `fail` → a [Human Gate](/en/nodes/human-gate/) to review.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Branch (JSON)](/en/nodes/branch-json/) — same routing, but reads a JSON field instead of a Markdown verdict.
- [Select (Markdown)](/en/nodes/select-markdown/) — conditional injection that always produces (no branching).
- [LLM Judge](/en/nodes/llm-judge/) — a typical source of the verdict.
