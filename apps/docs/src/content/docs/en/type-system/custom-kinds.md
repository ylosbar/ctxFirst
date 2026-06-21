---
title: Custom artifact kinds
description: Defining your own artifact kinds — the descriptor, JSON Schema payloads, refinement, Markdown projection, versioning, and structural identity.
sidebar:
  order: 5
---

Beyond the [built-in kinds](/en/type-system/kinds/), the type system is open: you can register your own. **User kinds** are declared from the app (encoded `user:<id>@<version>`); **plugin kinds** ship in a plugin's manifest (`plugin:<pluginId>:<id>@<version>`). Both resolve through the same registry as built-ins, so a custom kind is a first-class type — pickable on ports, validated at write time, and routable through [compatibility](/en/type-system/compatibility/).

## The descriptor

Every kind — built-in, user, or plugin — resolves to one **descriptor**. The fields you control when defining a custom kind:

| Field | Purpose |
| --- | --- |
| `id` / `version` | Logical identity. The pair `(id, version)` is **immutable** once published. |
| `name` / `description` | Shown in the kind picker and badges. |
| `simplifiedSchema` | The **JSON Schema** of the payload runners produce and consume. Compiled to a validator on first use. |
| `rawSchema` | Optional JSON Schema of a raw, pre-parse payload — used by the parser playground. |
| `sample` | Optional concrete example payload, shown read-only in the picker. Omitted ⇒ auto-derived from the schema. |
| `extends` | Optional super-type for [refinement](#refinement-with-extends). |
| `markdownTemplate` | Optional `{{field}}` template for the [Markdown projection](#markdown-projection). |
| `coerceFrom` | Optional read-time upgrade from a predecessor version — see [Versioning](#versioning--compatibility). |

Schemas are stored as **JSON Schema** (portable, easy to codegen from a sample) and compiled to a Zod validator the first time the kind is resolved. When a node writes an artifact of a custom kind, the store validates the payload against this schema before any I/O — a non-conforming payload is rejected at the source.

For example, a `user:Brief@v1` kind carries this `simplifiedSchema` and an optional `sample`:

```json
// simplifiedSchema — JSON Schema of the payload runners produce
{
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["title", "summary"]
}
```

```json
// sample — a concrete payload, shown read-only in the kind picker
{ "title": "Auth rework", "summary": "Move sessions to JWT.", "tags": ["auth", "backend"] }
```

## Refinement with `extends`

Set `extends` to make your kind a refinement of another. A port accepting the parent then also accepts your kind (covariance — path 5 of [compatibility](/en/type-system/compatibility/#accept-paths)); the inverse is not automatic. This is how `Url` refines `String` among the built-ins, and you can do the same with your own kinds (e.g. `user:TicketId@v1` extending `String`).

## Markdown projection

A kind can declare how it renders to human-friendly Markdown, used by [Render Markdown](/en/nodes/render-markdown/):

- **Built-in / plugin kinds** can carry a pure render **function** (`{ kind: "fn" }`), resolved on the main side and never serialized.
- **User kinds** declare a `{{field}}` **template** (`{ kind: "template" }`) via `markdownTemplate` — each placeholder is filled from the payload.

For the `user:Brief@v1` above, a `markdownTemplate` of:

```markdown
# {{title}}

{{summary}}
```

renders the sample payload as `# Auth rework` followed by `Move sessions to JWT.`

With no projection, `render.markdown` falls back deterministically: an embedded `renderedMarkdown` field, then a text-envelope `body`, then a pretty-printed JSON block. It never throws.

## Producing a custom kind

The general path is the [Transform](/en/nodes/transform-run/) node: it applies a saved parser to an upstream artifact and persists the result under a target `outputKind` — including any `user:` or `plugin:` kind. The store validates the parser's output against the kind's schema, so a transform that yields the wrong shape fails with a schema error rather than producing a malformed artifact. Project the result back to Markdown with [Render Markdown](/en/nodes/render-markdown/) when you need to feed it into a prompt.

## Versioning & compatibility

`(id, version)` records are immutable. Evolving a kind means **publishing a new version** with the same `id`:

- **Backward-compatible change** — bump the version; old artifacts stay valid.
- **In-place overwrite** at the same `(id, version)` is guarded: if the new schema would reject payloads that were valid under the stored one, the save is refused unless you explicitly authorize the breaking change. Bumping the version is the preferred path.
- **`coerceFrom`** — on a new version, declare a one-step, same-`id` read-time patch that reshapes a predecessor's payloads to the new shape before validation (e.g. rename a field). This is read-side metadata only and is never folded into the kind's identity.

For instance, a `user:Brief@v2` that renamed `summary` to `abstract` reads old `v1` payloads with:

```json
{
  "fromVersion": "v1",
  "patch": [{ "op": "rename", "from": "summary", "at": "abstract" }]
}
```

The patch vocabulary is tiny and idempotent: `set`, `setIfMissing`, `unset`, `rename`.

## Identity: the structural hash

Each descriptor carries a **structural hash** — a SHA-256 of its normalized schema folded with its refinement parent's hash. Two descriptors that hash to the same value are treated as the **same type** by [compatibility](/en/type-system/compatibility/#accept-paths) (path 6), regardless of name, version, or source. So a `user:` kind and a `plugin:` kind with the same shape are interchangeable on a port. Parametric kinds compose their hash from the inner kinds' hashes (with `OneOf<…>` variants sorted, so order doesn't matter). A kind can also be referenced directly by hash via the `record:<hash>` encoding.

Because the hash includes the refinement chain, `Url` and `String` hash differently even though both wrap `{ value: string }` — identity tracks meaning, not just shape.

## Authoring from MCP

Custom kinds can also be managed programmatically through the app's MCP authoring server, which exposes tools to `list`, `get`, and `save` artifact kinds (only `user:` kinds are editable — built-in and plugin kinds are read-only). This is handy for scripting kind definitions or generating them from a sample payload.

## See also

- [Kinds](/en/type-system/kinds/) — the built-in catalog and kind-string grammar.
- [Compatibility & wiring](/en/type-system/compatibility/) — how refinement (`extends`) and structural identity drive acceptance.
- [Transform](/en/nodes/transform-run/) — produces an artifact of a chosen kind via a saved parser.
- [Render Markdown](/en/nodes/render-markdown/) — projects a typed artifact into Markdown using its projection.
- [Plugins](/en/plugins/overview/) — how a plugin contributes kinds through its manifest.
