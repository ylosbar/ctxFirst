---
title: Render Markdown
description: The Render Markdown node — projects any typed artifact into human-friendly Markdown via the kind's projection.
---

`render.markdown`

**Render Markdown** projects any typed artifact (wildcard kind) into human-friendly `Markdown` via its kind's Markdown projection. The projection is resolved on the main side: a built-in / plugin function, a `{{field}}` template (`user` kinds), an embedded `renderedMarkdown` field, a `body` text envelope, or — as a last resort — a pretty-printed JSON block. It never throws.

It is the explicit, typed bridge into [Concat Markdown](/en/nodes/concat-markdown/): its `Markdown` output satisfies port acceptance without relaxing the strict contract or introducing implicit coercion. This node is engine-level and is not in the visual picker, but is used like any other node.

![The Render Markdown node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `*` | **Primary.** The typed artifact to project. In degraded mode (`payload === null`) the raw content is JSON-parsed best-effort, falling back to a `body` envelope. |
| Output | `out` | `Markdown` | Primary. The rendered Markdown. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| — | — | — | This node takes no configuration. |

## Runtime behavior

1. The runner takes the `in` input (error if none).
2. It resolves the kind's descriptor via `ctx.deps.artifactSchemas` (an unknown kind is fine — the renderer degrades to its generic chain).
3. It calls `renderArtifactMarkdown` with the descriptor's `markdownProjection` (or `null`) and the input payload (parsed from content in degraded mode).
4. It stores the resulting `Markdown` on `out` with `source: "render.markdown"`, `srcKind` and `srcArtifactId` metadata.

## Example

Project a plugin/domain artifact into Markdown before assembling a prompt:

- Input `in` ← a typed artifact (e.g. the output of a [Transform](/en/nodes/transform-run/)).
- Output `out` (`Markdown`) → a [Concat Markdown](/en/nodes/concat-markdown/) fragment or a [Markdown Template](/en/nodes/markdown-template/) variable port.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Concat Markdown](/en/nodes/concat-markdown/) — consumes the rendered Markdown as a strict `Markdown` input.
- [Transform](/en/nodes/transform-run/) — produces the typed artifact this node projects.
- [Markdown Template](/en/nodes/markdown-template/) — interpolates the rendered Markdown into a parametrized template.
