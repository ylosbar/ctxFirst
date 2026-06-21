---
title: Compatibility & wiring
description: The rules that decide whether an output port can connect to an input port — wildcard, direct match, list covariance, sum widening, refinement covariance, structural equality.
sidebar:
  order: 3
---

When you drag a connection between two ports, the editor asks one question: **does the consumer's input port accept the producer's output kind?** The same predicate runs at wiring time in the editor and again at validation time in the engine — keeping them identical is the only way to stop the editor from accepting a wire the engine would later refuse.

An **output** port declares a single concrete `kind`; an **input** port declares an array of accepted `kinds` (one or more concrete kinds, or the `*` wildcard). A wire is type-safe when the output kind satisfies at least one entry of the input's accepted set, under the rules below.

```ts
// Producer — a single concrete output kind
{ name: "out", kind: "Url" }

// Consumer — an array of accepted input kinds
{ name: "spec", kinds: ["String"] }

// → accepted: Url refines String, so it flows in (path 5, refinement covariance)
```

## Accept paths

The check tries each path in order and stops at the first match.

1. **Wildcard** — if the input port lists `*`, it accepts anything. (See [Kinds](/en/type-system/kinds/#the-wildcard-port-).)
2. **Direct match** — the output kind equals an accepted kind, comparing both the original and the [canonical](/en/type-system/kinds/#built-in-kinds) spelling (so `MarkdownList` matches `List<Markdown>`).
3. **List covariance** — `List<X>` flows into a port accepting `List<Y>` **iff** `X` flows into a port accepting `Y`. Covariance is recursive, so `List<Url>` satisfies `List<String>` (because `Url` refines `String`).
4. **Sum compatibility** — widening and subset over `OneOf<…>`. Detailed in [Sum types & results](/en/type-system/sum-types/). The reverse — extracting a variant from a sum — is **refused**; that requires an explicit [Branch (match)](/en/nodes/branch-match/).
5. **Refinement covariance** — a refinement of `X` is accepted by a port accepting `X`. The check walks the `extends` chain (e.g. `Url → String`), so a `Url` output satisfies a `String` input. Bounded by a seen-set to stay safe against a corrupted registry.
6. **Structural-hash equality** — two kinds whose descriptors normalize to the same **structural hash** are interchangeable, regardless of their name, version, or source. A `user:` record and a `plugin:` record with the same shape can feed the same port. See [Custom artifact kinds](/en/type-system/custom-kinds/#identity-the-structural-hash).

Paths 1–4 need no registry access (they run in the editor's hot loops); paths 5–6 are resolved against the kind registry.

## Examples

| Producer kind | Input accepts | Connects? | Why |
| --- | --- | --- | --- |
| `Markdown` | `["Markdown"]` | ✅ | Direct match. |
| `Markdown` | `["*"]` | ✅ | Wildcard. |
| `Url` | `["String"]` | ✅ | Refinement covariance (`Url` extends `String`). |
| `String` | `["Url"]` | ❌ | A plain string isn't a valid URL — narrowing isn't automatic. |
| `List<Url>` | `["List<String>"]` | ✅ | List covariance over the refinement. |
| `List<Markdown>` | `["MarkdownList"]` | ✅ | Canonical alias. |
| `String` | `["OneOf<String,Number>"]` | ✅ | Sum widening — matches a variant. |
| `OneOf<String,Number>` | `["String"]` | ❌ | Needs [Branch (match)](/en/nodes/branch-match/) to extract a variant. |
| `user:Brief@v2` | `["plugin:acme:Brief@v1"]` | ✅ | Structural-hash equality (same shape). |

## Fan-in (list inputs)

A port may be marked **list** — it accepts N converging transitions instead of one, each checked against the same accepted kinds. [Concat Markdown](/en/nodes/concat-markdown/) uses this to gather many `Markdown` fragments into one ordered input. A non-list input takes a single wire.

## Passthrough wires

A side-effect node that produces no artifact (e.g. [Workspace Set](/en/nodes/workspace-set/)) can still be chained: the outgoing wire is execution-only and bypasses the kind check entirely. The downstream input is resolved from the nearest data-producing ancestor at run time. This is how control-flow chaining coexists with typed data flow.

## See also

- [Kinds](/en/type-system/kinds/) — the kinds these rules compare.
- [Sum types & results](/en/type-system/sum-types/) — the widening/subset rules of path 4.
- [Custom artifact kinds](/en/type-system/custom-kinds/) — refinements (`extends`) and structural identity.
- [Wiring & variables](/en/template-editor/wiring-variables/) — where you draw the connections this page validates.
