---
title: Select (Markdown)
description: The Select (Markdown) node — conditionally injects a Markdown fragment based on a JSON flag, always producing an output.
---

`select.markdown`

**Select (Markdown)** is a conditional injector, not a router. It reads a boolean flag via JSONPath (`config.path`) from its `cond` input, then emits on the single `out` port the `body` of the `value` input when the flag is truthy, or empty Markdown otherwise. It **always** produces — there is no dead port and nothing to re-converge downstream, unlike a `branch.json` diamond.

Note the eager cost: the upstream that produces `value` always runs, even when the flag is false. For an expensive `value` (network, LLM), prefer a real [Branch (JSON)](/en/nodes/branch-json/) that skips the unused branch.

![The Select (Markdown) node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `cond` | `*` | **Required**, primary. Parsed as JSON (a leading code fence is stripped); `path` reads the flag from it. |
| Input | `value` | `Markdown`, `Json` | **Optional.** Its `body` is injected when the flag is truthy. Without it (or when false), the output is empty Markdown. |
| Output | `out` | `Markdown` | Primary. The injected fragment, or empty Markdown. Always produced. |

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `path` | `string` | `$.flag` | **Required.** Non-empty JSONPath into the `cond` JSON. Must match exactly one scalar value. |

## Runtime behavior

1. The runner validates `config.path` (non-empty) — throws otherwise.
2. It reads `cond`, strips a leading code fence, and `JSON.parse`s it (error if not valid JSON).
3. It evaluates `path` (error unless exactly one match) and coerces it to a boolean: `true`/non-zero number/non-empty string ≠ `"false"` → truthy; `false`/`null`/`0`/`""`/`"false"` → falsy; object/array throws.
4. If truthy and `value` is wired, it takes `value`'s `body`; otherwise the body is empty.
5. It serializes the body as `Markdown` and produces a new artifact on `out` (`source: "select.markdown"`, `condPath`, `injected`).

## Example

Conditionally append a section to a prompt:

- `cond` (`Json`) ← a payload like `{ "flag": true }`.
- `path`: `$.flag`.
- `value` (`Markdown`) ← the optional section to inject.
- `out` → wired into a [Concat Markdown](/en/nodes/concat-markdown/) fragment; empty when the flag is false.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Branch (JSON)](/en/nodes/branch-json/) — true branching (skips the unused branch) when `value` is expensive.
- [Concat Markdown](/en/nodes/concat-markdown/) — common consumer of the injected fragment.
