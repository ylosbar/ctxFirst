---
title: Invoke sub-template
description: The Invoke sub-template node — spawns an isolated child instance of another published template and waits for it.
---

`template.invoke`

**Invoke sub-template** delegates to a **child instance** of another published template. At runtime the orchestrator spawns an isolated instance of the referenced sub-template — with **its own run** — suspends this step in `awaitingChild`, and resumes once the child reaches a terminal state. The parent and child are wired through the sub-template's interface variables.

Contrast with [Sub-workflow](/en/nodes/workflow-call/), which **inlines** the referenced graph into the same run with no child instance.

![The Invoke sub-template node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

No static ports. The node is configured by `templateId` / `templateVersion`, and its ports are **derived from the referenced sub-template's interface variables** — one input port per `input` role variable, one output slot per `output` role variable. When the sub-template snapshot is not yet resolved, the node degrades to an empty signature (no ports) but stays pickable in the editor.

Wiring is done through these derived ports: the host binds them via the step's `readsFrom` / `writesTo`, exactly like any other node. The input variables seed the child instance; the child's output variables flow back to the parent's output slots when it terminates.

## Configuration

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `templateId` | `string` | `—` | Id of the published template to invoke as a child. **Required** — the child cannot resolve without a literal ref. |
| `templateVersion` | `string` | `—` | Version of the referenced template. **Required** — pinned when the author picks the sub-template. |

## Runtime behavior

1. The runner is side-effect-free: `run()` returns a `spawned-child` marker carrying the step config, declaring only the intention to spawn.
2. The orchestrator (which owns the event log) reads `{ templateId, templateVersion }`, resolves the child template, and seeds it from the input variables.
3. It emits `ChildInstanceSpawned` and the child's `InstanceStarted`, then flips this step to `awaitingChild`.
4. The child runs as an isolated instance with its own run; the parent step is suspended meanwhile.
5. When the child reaches a terminal state, the step resumes and its output variables flow back to the parent. Invocation depth is bounded to 8 (checked at root start and at each spawn) to guarantee termination.

## Example

Run a reusable sub-pipeline as an isolated child:

- `templateId` / `templateVersion`: the published template to invoke.
- Wire the host inputs to the derived input ports (its `input` interface variables) to seed the child, and consume its derived output ports downstream once the child completes.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Sub-workflow](/en/nodes/workflow-call/) — the inline alternative; runs in the same run with no child instance.
- [Human Gate](/en/nodes/human-gate/) — pause the parent for a human decision around an invocation.
