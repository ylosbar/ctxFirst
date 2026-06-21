---
title: Branch (match)
description: The Branch (match) node — dispatches a sum-typed artifact onto one output per variant of its OneOf kind.
---

`branch.match`

**Branch (match)** consumes a sum-typed artifact of kind `OneOf<A,B,…>` and unwraps it: it reads the payload's `variantKind` discriminator and emits the inner payload, materialized as a fresh artifact of that variant kind, on the matching output port — one port per variant. The unchosen ports never fire, so the orchestrator cascades a skip over downstream steps reachable only through them.

This is an advanced, engine-level kind: it does not appear in the visual node picker. Output port names are encoded as `out_<variant>` (e.g. `out_Markdown`).

![The Branch (match) node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `in` | `OneOf<…>` | **Required**, primary. The sum artifact whose kind is `config.targetKind`. Its payload must be a non-null object carrying a string `variantKind` and an inner `payload`. |
| Output | `out_<variant>` | `<variant>` | One output port per variant parsed from `targetKind`. Fires when the input's `variantKind` equals that variant. |

The inner payload is written through the artifact store as a new artifact of the variant kind (`payloadFormat: json-v1`, validated against the variant's descriptor) — downstream consumes `A`, not `OneOf<A,B>`.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `targetKind` | `string` | — | **Required.** The `OneOf<…>` kind to dispatch on. Must be a well-formed sum kind; the runner throws if missing, malformed, or not a OneOf encoding. |

## Runtime behavior

1. The runner reads `config.targetKind` and parses it into its variants (error if missing, not a `OneOf<…>`, or malformed).
2. It reads the artifact on `in` (error if missing) and requires a non-null object payload.
3. It reads `payload.variantKind` (error if not a string) and `payload.payload` (the inner value).
4. It checks the observed variant is one of the declared variants (error otherwise).
5. It writes the inner payload as a fresh artifact of the variant kind and emits it (`produced-on-port`) on `out_<variant>`. Steps wired only to the other ports are skipped in cascade.

## Example

Dispatch a `OneOf<Markdown,Json>` result:

- `targetKind`: `OneOf<Markdown,Json>`.
- `in` ← a sum artifact whose `variantKind` is `Markdown`.
- `out_Markdown` → a Markdown-consuming path; `out_Json` → a JSON-consuming path.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Branch (JSON)](/en/nodes/branch-json/) — value-based routing for the common case (the picker-visible router).
- [Branch](/en/nodes/branch-bool/) — Markdown-verdict routing.
