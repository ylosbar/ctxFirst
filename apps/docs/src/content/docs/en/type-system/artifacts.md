---
title: Artifacts
description: What an artifact is — the typed payload that flows between workflow steps, its shape, and how its content is stored and loaded.
sidebar:
  order: 1
---

An **artifact** is the typed payload that flows between the steps of a workflow. Every value a [node](/en/nodes/overview/) consumes or produces is an artifact: a seed captured from the user, a Markdown fragment, a JSON projection, a list of file paths, a domain object parsed by a transform. Each artifact carries a **kind** — its type — and the engine checks kind compatibility every time you wire two ports together.

This section describes that type system:

- **Artifacts** _(this page)_ — the data model and how content is stored and loaded.
- **[Kinds](/en/type-system/kinds/)** — the catalog of built-in kinds and the kind-string grammar.
- **[Compatibility & wiring](/en/type-system/compatibility/)** — when an output port can connect to an input port.
- **[Sum types & results](/en/type-system/sum-types/)** — `OneOf<…>`, `Success<T>` / `Error<E>`, and `branch.match`.
- **[Custom artifact kinds](/en/type-system/custom-kinds/)** — user- and plugin-defined types.

## The artifact shape

The domain manipulates only an artifact's **metadata** — the content is stored out-of-band and loaded on demand. An artifact's metadata is:

| Field | Meaning |
| --- | --- |
| `id` | Unique identifier of the artifact. |
| `kind` | The [kind](/en/type-system/kinds/) — the artifact's type (e.g. `Markdown`, `Json`, `user:Brief@v1`). |
| `hash` | SHA-256 of the content. Identical content produces the same hash, enabling storage deduplication. |
| `storageRef` | Opaque reference the store uses to locate the bytes (e.g. a filesystem path). |
| `metadata` | A read-only string map of tags (`source`, `srcKind`, `missing`, …) attached by the producing node. |
| `createdAt` | ISO 8601 creation timestamp. |

The **content is not embedded** in this record. It lives in the artifact store, keyed by `storageRef`; the engine loads it only when a step actually needs it. A concrete `Markdown` artifact's metadata looks like:

```json
{
  "id": "art_7f3a9c",
  "kind": "Markdown",
  "hash": "sha256:9c1f0b…",
  "storageRef": "artifacts/9c/1f/9c1f0b.md",
  "metadata": { "source": "markdown.template", "missing": "rules" },
  "createdAt": "2026-06-18T09:24:00Z"
}
```

## Content vs. payload

When a step reads an input, the engine loads the artifact and hands the runner both the raw text and the **parsed payload**:

- **content** — the raw stored string (the Markdown body, the JSON text, …).
- **payload** — the content parsed and validated against the kind's schema. A `Markdown` payload is `{ format: "markdown", body: "…" }`; a `String` payload is `{ value: "…" }`. See [Kinds](/en/type-system/kinds/) for every shape.

For that same `Markdown` artifact, the runner sees both:

```jsonc
// content — the raw stored string
"# Review\nCheck the spec against the rules."

// payload — parsed & validated against the Markdown schema
{ "format": "markdown", "body": "# Review\nCheck the spec against the rules." }
```

If the content can't be parsed against the kind (a malformed payload, an unknown kind), the runner runs in **degraded mode**: the payload is `null` and only the raw content is available. Tolerant nodes like [Render Markdown](/en/nodes/render-markdown/) fall back to a best-effort rendering rather than failing.

## How an artifact flows

1. A node runs and **produces** an artifact on one of its output ports — the engine writes the content to the store (validating it against the declared `kind` at write time) and records the metadata above.
2. A **transition** (an edge on the canvas) or a **workflow variable** carries that artifact to a downstream input port. See [Wiring & variables](/en/template-editor/wiring-variables/).
3. Before the wire is even allowed, the editor and the engine both check that the consumer's port **accepts** the producer's kind — see [Compatibility & wiring](/en/type-system/compatibility/).
4. The downstream node **loads** the artifact (content + payload) and runs.

Because the artifact is content-addressed by `hash`, re-producing the same bytes is deduplicated, and every artifact a run touches stays inspectable in the run history.

## See also

- [Kinds](/en/type-system/kinds/) — the catalog of built-in kinds and their payload shapes.
- [Compatibility & wiring](/en/type-system/compatibility/) — the rules that decide whether two ports can connect.
- [Nodes overview](/en/nodes/overview/) — the building blocks that consume and produce artifacts.
- [Wiring & variables](/en/template-editor/wiring-variables/) — transitions and workflow variables that carry artifacts between nodes.
