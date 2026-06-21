---
title: JSON Transform
description: The JSON Transform node — extracts N JSONPath projections from a JSON input, each emitted on its own output port.
---

`json.transform`

**JSON Transform** reads an arbitrary input artifact, parses it as JSON, then evaluates N JSONPath expressions. Each expression feeds a named output port declared in `config.transformations`; the result of an expression is always an array (even for a single scalar match, or zero matches). It emits one outcome covering every port.

The node fails if the input is not valid JSON (no string fallback).

![The JSON Transform node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `json` | `*` | **Primary.** The JSON to project. The payload `body` is parsed when present (else the raw content); a leading Markdown code fence is stripped first. |
| Output | `<transformation.port>` | `Json` (or `List<Json>` / `MarkdownList` when wrapped) | One output port per entry in `transformations`. Default `Json` body is the array of matches. |

When a transformation sets `wrap: "list"`, the port instead emits a list artifact (one element per match), ready for a [Loop Foreach](/en/nodes/loop-foreach/): `itemKind: "Json"` (default) yields `List<Json>`, `itemKind: "Markdown"` yields the legacy `MarkdownList`.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `transformations` | `{ port, expression, wrap?, itemKind? }[]` | `[{ port: "out", expression: "$" }]` | **Required**, at least 1 entry. Each entry declares an output port and its JSONPath. |
| `transformations[].port` | `string` | — | Output port name, must match `^[a-zA-Z_][a-zA-Z0-9_-]*$` and be unique. **Required.** |
| `transformations[].expression` | `string` | — | Non-empty JSONPath expression. **Required.** |
| `transformations[].wrap` | `"list"` | — | When `"list"`, emit a list artifact (one element per match) instead of a single `Json` array. |
| `transformations[].itemKind` | `"Json"` \| `"Markdown"` | `"Json"` | Element kind for `wrap: "list"`: `Json` → `List<Json>`, `Markdown` → `MarkdownList`. |

## Runtime behavior

1. The runner reads and validates `config.transformations` (error if empty, duplicate port, bad port name, or empty expression).
2. It takes the `json` input (error if none) and parses its body/content as JSON after stripping a leading code fence (error if invalid JSON).
3. For each transformation it evaluates the JSONPath (`wrap: true`, so the result is always an array); an invalid expression throws and surfaces as a step failure.
4. It stores one artifact per port — `Json` (`format: "json"`, body = matches array) by default, or `List<Json>` / `MarkdownList` when wrapped — with `source: "json.transform"`, `port`, `expression`, `srcArtifactId`, `srcKind` (and `count` for lists) metadata, and emits a `produced-many` outcome.

## Example

Split a JSON list into per-item Markdown for a loop:

- `transformations`: `[{ port: "items", expression: "$.tasks[*]", wrap: "list", itemKind: "Markdown" }]`.
- Input `json` ← upstream JSON output.
- Output `items` (`MarkdownList`) → a [Loop Foreach](/en/nodes/loop-foreach/) feeding a [Concat Markdown](/en/nodes/concat-markdown/) prompt builder.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Transform](/en/nodes/transform-run/) — applies a saved parser rather than inline JSONPath.
- [Loop Foreach](/en/nodes/loop-foreach/) — consumes a `wrap: "list"` output element by element.
- [Branch JSON](/en/nodes/branch-json/) — routes on a JSONPath predicate rather than projecting values.
