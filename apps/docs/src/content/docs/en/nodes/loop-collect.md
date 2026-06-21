---
title: Collect
description: The Collect node — aggregates the per-iteration outputs of a For each scope into a single list artifact.
---

`loop.collect`

**Collect** closes the scope opened by a [For each](/en/nodes/loop-foreach/) node. Once the orchestrator has run all N iterations, it hands this runner the N per-iteration artifacts in array order, and the runner stacks them into a single list artifact on the `items` port.

[For each](/en/nodes/loop-foreach/) and **Collect** work as a **pair**: the first fans out, the second fans in.

![The Collect node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `item` | `Markdown` (= `itemKind`) | Primary, **list input** (`isList`): receives one value per iteration of the enclosing `loop.foreach` scope. |
| Output | `items` | `MarkdownList` (depends on `itemKind`) | Primary. The aggregated list of all per-iteration values. With `itemKind` other than `Markdown`/`Path`, the kind is `List<itemKind>`. |

The input/output kinds follow `config.itemKind` (default `Markdown`), symmetric to `loop.foreach`. `Markdown` → `MarkdownList`, `Path` → `PathList`, any other kind `T` → `List<T>`.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `itemKind` | `ArtifactKind` | `"Markdown"` | Kind of each collected element. Determines the `item` input kind and the `items` output list kind. Must be a known artifact kind. Should match the paired `loop.foreach`. |

## Runtime behavior

1. The runner reads `itemKind` (default `Markdown`) and derives the list kind (`MarkdownList` / `PathList` / `List<T>`).
2. The orchestrator fires this step only after every iteration of the scope completed, feeding the N `item` inputs in array order.
3. For legacy kinds (`Markdown` / `Path`) it extracts each scalar (`body` / `path`) into a `{ bodies }` / `{ paths }` payload; otherwise it stacks each full `T` payload under `{ items }`.
4. It stores the list artifact on `items` with `source: "loop.collect"`, `itemKind`, and `count` metadata.

## Example

Aggregate per-iteration results back into one list:

- Input `item` (`Markdown`) ← the per-iteration output of the sub-graph inside a [For each](/en/nodes/loop-foreach/) scope.
- Output `items` (`MarkdownList`) → wired downstream (e.g. into a [Concat Markdown](/en/nodes/concat-markdown/) to assemble a report).

## See also

- [Nodes overview](/en/nodes/overview/)
- [For each](/en/nodes/loop-foreach/) — opens the scope this node closes; the two work as a pair.
- [Concat Markdown](/en/nodes/concat-markdown/) — common consumer that assembles the collected fragments.
