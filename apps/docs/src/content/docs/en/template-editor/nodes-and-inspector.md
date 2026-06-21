---
title: Adding & configuring nodes
description: The node palette, the step inspector, per-kind configuration, and testing a node in the Studio.
sidebar:
  order: 2
---

A template is made of [nodes](/en/nodes/overview/). You add them from the palette and configure the selected one in the inspector.

## Adding a node

The toolbar **Nodes** button opens a searchable palette, grouped by the same categories as the [node catalog](/en/nodes/overview/) (Sources / Inputs, AI generation, Transformation, Flow / Control, Human validation, System / Execution). Filter by typing in the search box, then **drag an item onto the canvas** to place it where you drop it, or click to add it.

When you drop a transition onto empty canvas, an **edge-drop suggestion** menu (“Search for a step…”) lets you create a compatible node already wired to that edge.

## The inspector

Selecting a node opens the **inspector** as a right-side panel (drag its left edge to resize; the width is remembered). It is organized into a header plus collapsible sections.

### Header

- **Kind selector** — change the node's [step kind](/en/nodes/overview/).
- **Set as entry point** / **Entry** badge — mark this node as the workflow's entry (where the [run](/en/template-editor/save-publish-run/) starts).
- **Test the node** — opens the Studio (see below).

### Sections

- **Configuration** — the per-kind parameters (e.g. a model selector for an LLM node, a path for a file loader). Nodes with no parameters show _“No specific parameter to configure for this step kind.”_
- **Wiring** — connect the node's ports to transitions and workflow variables. See [Wiring & variables](/en/template-editor/wiring-variables/).
- **Behavior** — the **Actor**, the **Requires human validation** toggle (turns the step into a [human gate](/en/nodes/human-gate/) checkpoint), and a free-form **Note** attached to the step.
- **Advanced** — the step **Identifier** (used in transitions and by the execution engine) and its **Technical kind**.

## Editing a transition

Selecting an edge shows its `source → target` transition, a **Loop** toggle (a dashed feedback edge that re-runs the step — the basis of the [validation loop](/en/tutorials/human-validation-loop/)), and a delete action.

## Testing a node — the Studio

**Test the node** opens the **Studio**, a side panel that runs the selected node in isolation: fill its inputs, run it, and inspect the produced artifact(s) and timing — without launching the whole template. Some effects are not reproduced in the Studio (a `workspace.set`/cwd change, or a step that awaits human validation); test those in a real run.

## See also

- [Wiring & variables](/en/template-editor/wiring-variables/) — connecting the ports you see here.
- [Nodes overview](/en/nodes/overview/) — every node's ports, config, and runtime behavior.
- [The canvas](/en/template-editor/canvas/) — arranging the nodes you add.
