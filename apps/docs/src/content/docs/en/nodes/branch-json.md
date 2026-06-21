---
title: Branch (JSON)
description: The Branch (JSON) node — routes the workflow to one of N branches based on a JSON field read from the input.
---

`branch.json`

**Branch (JSON)** parses its input as JSON, evaluates a JSONPath (`config.path`) against it, coerces the matched scalar to a string, and routes the run to exactly one of N output ports — one port per entry in `config.cases`. It fills the gap between [Branch](/en/nodes/branch-bool/) (which needs a Markdown verdict) and [JSON Transform](/en/nodes/json-transform/) (which always re-emits a JSON array).

The decision is read from the already-persisted artifact — deterministic, no LLM or network. The matching port re-emits the input artifact unchanged; the other ports never fire, so the orchestrator cascades a skip over downstream steps reachable only through them.

![The Branch (JSON) node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `json` | `*` | **Required**, primary. Parsed as JSON (a leading code fence is stripped); for wrapper kinds the `payload.body` string is parsed, otherwise the raw `content`. |
| Output | `<case>` | `inputKind` | One output port per entry in `config.cases`. Fires when the value at `path` equals that case label. |

The input artifact is re-emitted unchanged on the chosen port (no new bytes written). Outputs default to the `Json` kind unless `inputKind` overrides it.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `path` | `string` | `$.flag` | **Required.** Non-empty JSONPath into the input JSON. Must match exactly one scalar value. |
| `cases` | `string[]` | `["true", "false"]` | **Required.** ≥2 unique labels, each matching `/^[a-zA-Z_][a-zA-Z0-9_-]*$/` (used as port names). Each becomes one output port. |
| `inputKind` | `string` | `Json` | Artifact kind declared on the output ports (passthrough kind). |

## Runtime behavior

1. The runner validates `config.path` (non-empty) and `config.cases` (≥2 unique, port-name-safe labels) — throws otherwise.
2. It reads the input on `json`, strips a leading code fence, and `JSON.parse`s it (error if not valid JSON).
3. It evaluates `path` against the parsed data (error if 0 matches or >1 matches).
4. It coerces the single match to a string: booleans/numbers via `String(...)`, strings verbatim, `null` → `"null"`; an object/array throws (non-scalar).
5. It finds the case equal to that string (error if none match).
6. It loads the input artifact's meta and re-emits it unchanged (`produced-on-port`) on the matching port. Steps wired only to the other ports are skipped in cascade.

## Example

Route on a JSON flag from an upstream transform:

- `json` (`Json`) ← a payload like `{ "flag": "approved" }`.
- `path`: `$.flag`, `cases`: `["approved", "rejected"]`.
- `approved` → continue; `rejected` → a [Human Gate](/en/nodes/human-gate/).

## See also

- [Nodes overview](/en/nodes/overview/)
- [Branch](/en/nodes/branch-bool/) — same routing on a Markdown verdict instead of a JSON field.
- [JSON Transform](/en/nodes/json-transform/) — shapes the JSON that feeds the `path`.
- [Select (Markdown)](/en/nodes/select-markdown/) — conditional injection that always produces (no branching).
