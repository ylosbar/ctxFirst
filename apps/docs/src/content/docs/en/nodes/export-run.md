---
title: Export Run
description: The Export Run node — snapshots the entire run as one self-contained JSON artifact.
---

`export_run`

**Export Run** serializes the complete state of the run it executes in — events, executions, inline artifacts, LLM sessions, runs and feedback loops — and stores it as a single self-contained `RunExport` JSON artifact on the `bundle` port. The bundle is read and shared through the existing artifact viewer.

The snapshot is taken just before this step's own production event, so the bundle describes the whole history "except producing itself" (a documented self-reference).

![The Export Run node in the workflow studio (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Ports

| Direction | Port | Kind | Notes |
| --- | --- | --- | --- |
| Input | `trigger` | `*` | **Optional**, primary. Lets you anchor the step anywhere in the DAG. Its content is **not** consumed. |
| Output | `bundle` | `RunExport` | Primary. A self-contained JSON bundle describing the entire instance. |

## Configuration

This node takes no configuration.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| — | — | — | No configurable keys. |

## Runtime behavior

1. The runner exports the current instance (`ctx.instanceId`) into a bundle object.
2. It serializes the bundle to pretty-printed JSON.
3. It stores it as a `RunExport` artifact (`format: "json"`, `schemaVersion: 1`) on the `bundle` port, with `source` and `sizeBytes` metadata.

## Example

Capture a full run for sharing or debugging:

- Wire the `trigger` input from the last meaningful step (anywhere in the DAG) so the export runs at the end.
- Output `bundle` (`RunExport`) → open it in the artifact viewer to inspect or share the complete run.

## See also

- [Nodes overview](/en/nodes/overview/)
- [Shell Exec](/en/nodes/shell-exec/) — a node whose `stdout`/`stderr` show up in the exported run.
- [Human Gate](/en/nodes/human-gate/) — a common upstream `trigger` source at the end of a flow.
