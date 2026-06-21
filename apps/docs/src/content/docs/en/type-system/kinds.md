---
title: Kinds
description: The catalog of built-in artifact kinds, their payload shapes, the wildcard port, and the kind-string grammar.
sidebar:
  order: 2
---

A **kind** is the type of an [artifact](/en/type-system/artifacts/). Every output port declares a single kind; every input port declares the set of kinds it accepts. The kind is a plain string — it round-trips through events, IPC and the artifact store — and falls into one of a few families described below.

## Built-in kinds

A closed set of kinds ships in the binary. Each has a compiled schema; its **payload** is the parsed shape a runner produces and consumes. They group into three regimes.

### Primitive scalars — `{ value: T }`

The root non-envelope scalars.

| Kind | Payload sample | Notes |
| --- | --- | --- |
| `String` | `{ "value": "" }` | The root of every text-shaped refinement. |
| `Number` | `{ "value": 0 }` | |
| `Boolean` | `{ "value": false }` | |

### String refinements — `{ value: T }`, `extends: String`

Refinements narrow `String` with extra validation. A port that accepts `String` also accepts any of these (covariance — see [Compatibility & wiring](/en/type-system/compatibility/)); the reverse is not automatic.

| Kind | Payload sample | Refines |
| --- | --- | --- |
| `Url` | `{ "value": "https://example.com" }` | a valid URL |
| `Email` | `{ "value": "user@example.com" }` | a valid email |
| `DateTime` | `{ "value": "2026-01-01T00:00:00Z" }` | an ISO datetime |
| `LinearRef` | `{ "value": "ABC-123" }` | a Linear issue reference |

### Envelopes & structured kinds

Envelopes are opaque text with a declared `format`; the rest are typed non-textual shapes.

| Kind | Payload sample | Notes |
| --- | --- | --- |
| `Markdown` | `{ "format": "markdown", "body": "# Hello\n" }` | Text envelope. The `body` is what [template variables](/en/features/variables/) substitute. |
| `Json` | `{ "format": "json", "body": "{}" }` | Text envelope holding a JSON string. |
| `Path` | `{ "path": "/tmp/foo.txt" }` | A single filesystem path. |
| `PathList` | `{ "format": "path-list", "paths": ["/tmp/foo.txt"] }` | A list of paths. Canonical alias of `List<Path>`. |
| `MarkdownList` | `{ "format": "markdown-list", "bodies": ["# A", "# B"] }` | A list of Markdown bodies. Canonical alias of `List<Markdown>`. |
| `RunExport` | `{ "format": "json", "schemaVersion": 1, "body": "{}" }` | The self-contained bundle produced by [Export Run](/en/nodes/export-run/). |

:::note[Legacy list aliases]
`PathList` and `MarkdownList` predate the parametric `List<…>` grammar and are kept as **aliases** of `List<Path>` and `List<Markdown>`. A producer of either spelling matches a consumer of the other — compatibility canonicalises both sides before comparing.
:::

## The wildcard port — `*`

`*` is not a kind; it is a **port matcher** that accepts any kind. Polymorphic nodes use it on their input — [Render Markdown](/en/nodes/render-markdown/) and [Transform](/en/nodes/transform-run/) both take `*` so they can operate on any upstream artifact. A `{{variable}}` templating node also exposes an optional `in` port typed `*`, reserved for control-flow chaining (see [Template variables](/en/features/variables/)).

An **output** port never carries `*` — it always produces one concrete kind.

## The kind-string grammar

Beyond the built-ins, a kind string can encode dynamic and parametric types. The `<` character appears in no other encoding, so the grammar is unambiguous.

| Form | Example | Meaning |
| --- | --- | --- |
| Built-in | `Markdown` | A kind shipped in the binary. |
| `user:<id>@<version>` | `user:Brief@v1` | A [user-defined kind](/en/type-system/custom-kinds/). |
| `plugin:<pluginId>:<id>@<version>` | `plugin:linear:Ticket@v1` | A [plugin-contributed kind](/en/type-system/custom-kinds/). |
| `List<T>` | `List<Markdown>` | A list of an inner kind. Nesting allowed (`List<List<Path>>`). |
| `OneOf<A,B,…>` | `OneOf<Url,Markdown>` | A [sum type](/en/type-system/sum-types/) of 2–6 variants. |
| `Success<T>` / `Error<E>` | `Success<Json>` | [Result](/en/type-system/sum-types/) wrappers. |
| `record:<hash>` | `record:1a2b3c…` | A content-addressed reference to a descriptor by its structural hash. |

Parametric and dynamic kinds are bounded to keep validation cheap: nesting is capped at **depth 4**, and a `OneOf<…>` holds **at most 6** variants (with no duplicates). Their descriptors are synthesized on demand by the registry from the inner kinds' descriptors.

Compound kinds read inside-out. For example, the idiomatic result type decodes as:

```text
OneOf< Success<Brief>, Error<String> >
  │       │      │        │     │
  │       │      │        │     └─ variant payload: a built-in String
  │       │      │        └─ the "error" half of a result
  │       │      └─ variant payload: the user kind Brief
  │       └─ the "success" half of a result
  └─ a sum of exactly these two variants
```

## See also

- [Artifacts](/en/type-system/artifacts/) — the values these kinds type.
- [Compatibility & wiring](/en/type-system/compatibility/) — how a port decides which kinds it accepts.
- [Sum types & results](/en/type-system/sum-types/) — `OneOf<…>`, `Success<T>` and `Error<E>` in depth.
- [Custom artifact kinds](/en/type-system/custom-kinds/) — defining your own `user:` kinds.
