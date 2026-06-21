---
title: Wiring & variables
description: How data flows between nodes — transitions, workflow variables, and the readsFrom / writesTo model.
sidebar:
  order: 3
---

Data flows between nodes two ways, both edited in the inspector's **Wiring** section (“Wire the inputs and outputs to workflow variables.”):

- **Transitions** — the edges on the canvas. An input port can read directly from the **upstream transition** (the artifact the previous step produced).
- **Workflow variables** — named state slots a step can read from (`readsFrom`) or write to (`writesTo`), decoupling a producer from its consumers.

:::note[Two kinds of "variables"]
This page is about **workflow variables** — the named state slots managed with the **Variables** button. They are distinct from **template variables**, the `{{variable}}` placeholders inside a [Markdown Template](/en/nodes/markdown-template/) or a skill body — those are covered in [Template variables](/en/features/variables/). A `{{placeholder}}` becomes an input *port*, which you can then wire to a workflow variable here.
:::

## The Wiring section

For the selected node, the inspector lists:

- **Inputs** — one row per input port. Each offers a dropdown set to **— upstream transition —** (take the previous step's output) or to a compatible **workflow variable**. Ports are filtered by their accepted artifact `kind`.
- **Outputs** — one row per output port. Each writes to a chosen workflow variable, or **— none —**.

A passthrough step (no artifact produced) shows _“Passthrough — no artifact produced.”_; a step with neither input nor output shows _“This step has neither input nor output.”_

On the canvas, a **variable pill** is drawn along the edge to show which variable flows through a connection.

## Managing variables

The toolbar **Variables** button (with the declared count) opens the variables manager — search the existing ones or **Create a variable**. Each variable has:

| Field | Purpose |
| --- | --- |
| **Name** | The identifier (e.g. `ticketDescription`). |
| **Kind** | The artifact kind it carries — constrains which ports can wire to it. |
| **Description** | Optional free-form note. |
| **Default value** | Optional; materialized at launch before any step (a producer step then overwrites it; no reset per loop iteration). |
| **Role** | The sub-workflow interface: **Internal** (private), **Input** (provided by the caller), or **Output** (exposed to the caller). Input/Output roles make the template callable as a sub-workflow via [`workflow.call`](/en/nodes/workflow-call/). |
| **Prompt at launch** | Ask for the value when launching a run. A variable written by a step can't be a launch input; a required launch input (no default) makes the template non-invocable as a sub-workflow and non-schedulable until it has a default. |

## See also

- [Template variables](/en/features/variables/) — the `{{variable}}` placeholder mechanism (a different concept).
- [Adding & configuring nodes](/en/template-editor/nodes-and-inspector/) — where the Wiring section lives.
- [Sub-workflow](/en/nodes/workflow-call/) — consumes a template's Input/Output variables as its interface.
