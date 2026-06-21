---
title: Sum types & results
description: Tagged unions with OneOf<…>, the Success<T> / Error<E> result wrappers, and how branch.match dispatches a sum onto typed outputs.
sidebar:
  order: 4
---

A **sum type** models a value that is one of several alternatives — "this artifact is either a `Url` or a `Markdown`". CtxFirst encodes them as `OneOf<…>`, with `Success<T>` and `Error<E>` as ready-made wrappers for the result pattern.

## `OneOf<A,B,…>`

A discriminated sum of N variants, written `OneOf<A,B,C>` (no whitespace). Its payload is a tagged record:

```json
{ "variantKind": "Url", "payload": { "value": "https://example.com" } }
```

- `variantKind` is one of the inner kinds.
- `payload` matches that variant's descriptor.

Constraints, enforced when the kind string is parsed:

- **2 to 6 variants** — a single-variant sum is just the variant; more than six is rejected to bound the UI surface and the cost of compatibility checks.
- **No duplicates** — `OneOf<A,A>` collapses to `A` and is refused, to surface the modelling error at the source.
- **Depth ≤ 4** — variants may themselves be parametric (`OneOf<List<Markdown>,Path>`), bounded by the global nesting cap.

Variant order does not matter for identity: `OneOf<A,B>` and `OneOf<B,A>` are the same type (their [structural hash](/en/type-system/custom-kinds/#identity-the-structural-hash) sorts the variants).

## Producing and consuming a sum

Two directions are accepted by [compatibility](/en/type-system/compatibility/); a third is deliberately refused.

- **Widening** — a producer of `A` flows into a port accepting `OneOf<A,B>`, as long as `A` matches some variant (recursively, so refinements count: `String → OneOf<Url,Markdown>` works when `String` satisfies a variant).
- **Subset** — a producer of `OneOf<A>` flows into a port accepting `OneOf<A,B>` when every produced variant is covered by some accepted variant.
- **Extraction (refused)** — a producer of `OneOf<A,B>` does **not** flow into a port accepting plain `A`. Narrowing a sum to one of its variants is an explicit step — that's what `branch.match` is for.

## Dispatching with `branch.match`

[Branch (match)](/en/nodes/branch-match/) is the eliminator for a sum. It takes a `OneOf<A,B,…>` input and exposes one output port per variant; at run time it reads the payload's `variantKind`, selects the matching output, and re-materializes the inner `payload` as a fresh artifact of that variant's kind. Downstream each branch is strongly typed as the variant, so the extraction the type system refused implicitly is now explicit and safe.

## `Success<T>` and `Error<E>`

Sugar for the two halves of a result:

- `Success<T>` — the record `{ variant: "Success", value: T }`.
- `Error<E>` — the record `{ variant: "Error", value: E }`.

They are dedicated parametric kinds (implemented like `List<T>` at the grammar level) so the discriminator round-trips through events. The idiomatic result type composes them under a sum:

```text
OneOf<Success<Brief>,Error<String>>
```

A producer emits one half. The payloads nest the sum tag, the result tag, and the inner kind's payload — concretely, the two branches look like:

```jsonc
// success branch — variantKind is the Success<Brief> wrapper
{
  "variantKind": "Success<Brief>",
  "payload": { "variant": "Success", "value": { "title": "Auth rework", "summary": "Move sessions to JWT." } }
}

// error branch — Error<String>, whose inner String payload is { value: … }
{
  "variantKind": "Error<String>",
  "payload": { "variant": "Error", "value": { "value": "rate limited" } }
}
```

A `branch.match` downstream splits the success path from the error path, each typed as its own kind.

## See also

- [Kinds](/en/type-system/kinds/) — the kind-string grammar, including `OneOf<…>`, `Success<T>`, `Error<E>`.
- [Compatibility & wiring](/en/type-system/compatibility/) — the widening/subset rules that govern sums.
- [Branch (match)](/en/nodes/branch-match/) — the node that dispatches a sum onto typed outputs.
- [Branch (JSON)](/en/nodes/branch-json/) — route on a JSONPath field when you don't have a typed sum.
