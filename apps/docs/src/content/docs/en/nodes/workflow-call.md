---
title: Sub-workflow
description: The Sub-workflow node — inlines another published template's graph at start, running its steps in the same run.
---

`workflow.call`

**Sub-workflow** references another published template and **inlines** its graph into the current one. Before the run starts, the expansion pass replaces every `workflow.call` step with the referenced template's steps — they run in the **same run**, with no child instance. The step kind is a marker: its `run()` is never invoked.

Contrast with [Invoke sub-template](/en/nodes/template-invoke/), which spawns an **isolated child instance** (its own run) instead of inlining.

![The Sub-workflow node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

No static ports. The node is configured by `templateId` / `templateVersion`, and its ports are **derived from the referenced sub-template's interface variables** — one input port per `input` role variable, one output slot per `output` role variable. When the sub-template snapshot is not yet resolved, the node degrades to an empty signature (no ports) but stays pickable in the editor.

Wiring is done through these derived ports: the host binds them via the step's `readsFrom` / `writesTo`, aliasing the sub-template's interface variables onto the host's local variables. At inline time, boundary edges become control wires (data flows through the aliased variables).

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `templateId` | `string` | `—` | Id of the published template to inline. **Required** — flattening fails without a literal ref. |
| `templateVersion` | `string` | `—` | Version of the referenced template. **Required** — pinned so the inlined graph is reproducible. |

## Runtime behavior

1. The `workflow.call` step never executes directly — reaching its `run()` is a flattening bug.
2. Before the instance runs, `flattenTemplate` reads `{ templateId, templateVersion }` and recursively inlines the referenced template's steps, transitions, and variables in place of the call.
3. Child interface variables bound through the call (`readsFrom` / `writesTo`) alias onto host variables; unbound or internal child variables become private, namespaced host variables.
4. Boundary edges are reduced to control wires; incoming edges target the child entry, outgoing edges leave from the exit producing the routed output variable.
5. The result is a single flat **effective template** with no `workflow.call` step, which the orchestrator runs unmodified. Reference cycles and an expansion depth over 8 are rejected.

## Example

Reuse a shared "lint and format" sub-workflow inline:

- `templateId` / `templateVersion`: the published template to inline.
- Wire the host inputs to the derived input ports (its `input` interface variables), and consume its derived output ports downstream — all inside the same run.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Invoke sub-template](/en/nodes/template-invoke/) — the isolated-child-instance alternative; inlines nothing.
- [User Input](/en/nodes/user-input/) — a typical source feeding the derived input ports.
