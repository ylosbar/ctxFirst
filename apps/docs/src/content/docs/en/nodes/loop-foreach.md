---
title: For each
description: The For each node — iterates over an array, fanning out the downstream sub-graph until the matching Collect.
---

`loop.foreach`

**For each** opens an iteration scope over an input list. For each element it fans out the downstream sub-graph until the matching [Collect](/en/nodes/loop-collect/) node, exposing the current element as a single `item` artifact on each iteration.

The runner itself does not materialise the N iterations: it validates the shape of the input array and re-emits it as a list artifact so the run stays replayable. The orchestrator then reads that list and drives the per-iteration fan-out.

![The For each node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `items` | `MarkdownList` (depends on `itemKind`) | **Optional** — wire a list to iterate over, or set `config.items` instead. With `itemKind` other than `Markdown`/`Path`, the kind is `List<itemKind>`. |
| Output | `item` | `Markdown` (= `itemKind`) | Primary. The current element, produced once per iteration; downstream nodes see one `item` per pass. |

The input/output kinds follow `config.itemKind` (default `Markdown`). `Markdown` → `MarkdownList`, `Path` → `PathList`, any other kind `T` → `List<T>`.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `itemKind` | `ArtifactKind` | `"Markdown"` | Kind of each element. Determines the `items` input kind and the `item` output kind. Must be a known artifact kind. |
| `items` | `string[]` | `—` | Optional hardcoded source. When set, each string is serialised to `itemKind` and the wired `items` input is ignored. One of `items` (config) or a wired `items` input is **required**. |

## Runtime behavior

1. The runner reads `itemKind` (default `Markdown`) and derives the list kind (`MarkdownList` / `PathList` / `List<T>`).
2. It picks the source: `config.items` (hardcoded strings) if set, otherwise the wired `items` input — error if neither is provided.
3. A wired input must match the expected list kind, else it throws.
4. It parses the array into N elements (legacy `{ bodies }` / `{ paths }` for `Markdown`/`Path`, canonical `{ items }` otherwise) and re-emits the full list artifact with `source: "loop.foreach"`, `itemKind`, and `count` metadata.
5. The orchestrator then materialises one `item` per element, running the sub-graph N times up to the matching `loop.collect`.

## Example

Iterate over a list of files and process each one:

- `items` (`MarkdownList`) ← a list artifact (e.g. from an upstream node), or set `config.items` to a fixed list.
- Output `item` (`Markdown`) → wired to the per-iteration sub-graph (e.g. a [Claude Code Invoke](/en/nodes/claude-code-invoke/)).
- Close the scope with a [Collect](/en/nodes/loop-collect/) node downstream to aggregate the per-iteration results.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Collect](/en/nodes/loop-collect/) — closes the scope this node opens; the two work as a pair.
- [Concat Markdown](/en/nodes/concat-markdown/) — assemble per-iteration fragments before or after the loop.
