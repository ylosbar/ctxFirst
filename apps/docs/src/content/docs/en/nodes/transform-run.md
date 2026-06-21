---
title: Transform
description: The Transform node — applies a saved parser/transform to the input artifact and produces a new typed artifact.
---

`transform.run`

**Transform** consumes the input artifact on the `src` port, applies a **saved** parser (resolved via `config.transformRef`), and persists the result as a new typed artifact of `config.outputKind` (polymorphic). It runs no LLM and is deterministic.

It replaces the implicit "parser-as-option" mechanism: each transformation becomes an explicit, reusable node in the graph, visible as an artifact in the run history.

![The Transform node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `src` | `*` | **Primary.** The artifact to transform. Its content is JSON-parsed best-effort; raw text is passed through unchanged when it isn't JSON. |
| Output | `out` | `config.outputKind` | Primary. The transformed artifact, validated against `outputKind` by the artifact store at `put` time. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `outputKind` | `string` | `"Markdown"` | Kind of the produced artifact. **Required** — the runner fails if missing or empty. |
| `transformRef` | `{ id, version }` | `{ id: "", version: "" }` | Pointer to a saved parser. **Required** — both `id` and `version` must be non-empty strings. |

## Runtime behavior

1. The runner reads `config.outputKind` (error if missing/empty) and `config.transformRef` (error if `id` or `version` is missing).
2. It checks that `parsers` and `parserRuntime` are wired in `ctx.deps` (composition-root wiring) — error otherwise.
3. It takes the `src` input (error if none) and resolves the parser by ref (error if not found, `id@version`).
4. It JSON-parses the input content best-effort (falls back to raw text on parse failure) and runs the parser through `parserRuntime`.
5. It stores the result under `outputKind` with `source: "transform.run"`, `transformerId`, `transformerVersion`, `srcArtifactId` and `srcKind` metadata. A non-conforming payload throws `ArtifactSchemaError`, surfaced as a `StepFailed { reason: "invalid-output" }`.

## Example

Parse a raw JSON artifact into a typed domain artifact:

- `transformRef`: `{ id, version }` of a saved parser.
- `outputKind`: the target kind (e.g. `Markdown` or a plugin kind).
- Input `src` ← upstream JSON output; output `out` → e.g. a [Render Markdown](/en/nodes/render-markdown/) node to project it, or a [Concat Markdown](/en/nodes/concat-markdown/) prompt builder.

## See also

- [Nodes overview](/en/nodes/overview/)
- [JSON Transform](/en/nodes/json-transform/) — extracts JSONPath projections inline (no saved parser).
- [Render Markdown](/en/nodes/render-markdown/) — projects the resulting typed artifact into human-friendly Markdown.
- [Concat Markdown](/en/nodes/concat-markdown/) — assembles the projected Markdown into a prompt.
