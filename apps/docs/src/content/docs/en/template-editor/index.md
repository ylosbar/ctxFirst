---
title: Editor overview
description: The template editor — the visual studio where you build a template (a workflow) from nodes, wire them, then run it.
sidebar:
  order: 0
---

The **template editor** is the visual studio where you build a **template** — a workflow graph made of [nodes](/en/nodes/overview/) wired together. You add nodes, configure them, connect their ports, then save, publish, and launch a run, all from the same screen.

![The template editor (screenshot to add)](../../../../assets/nodes/placeholder.png)

## Layout

The editor is organized into four regions:

| Region | What it does |
| --- | --- |
| **Title bar** | The template's identity — name, reference (ID), version, and description. See [Saving, publishing & running](/en/template-editor/save-publish-run/). |
| **Toolbar** | Actions and canvas modes — add nodes, manage variables, auto-layout, groups, notes, export, save, publish, launch a run. |
| **Canvas** | The React Flow graph — the `Start` entry marker, step nodes, transitions, variable pills, groups, and sticky notes. See [The canvas](/en/template-editor/canvas/). |
| **Inspector** | A resizable right-side panel that configures the selected node or transition. See [Adding & configuring nodes](/en/template-editor/nodes-and-inspector/). |

## In this section

- **[The canvas](/en/template-editor/canvas/)** — navigation, drag vs box-select modes, grid snap, auto-layout, groups, sticky notes, and export.
- **[Adding & configuring nodes](/en/template-editor/nodes-and-inspector/)** — the node palette, the step inspector, per-kind configuration, and testing a node in the Studio.
- **[Wiring & variables](/en/template-editor/wiring-variables/)** — connecting ports through transitions and workflow variables (`readsFrom` / `writesTo`).
- **[Saving, publishing & running](/en/template-editor/save-publish-run/)** — drafts, publishing & immutability, dependencies, and launching a run.

## See also

- [Nodes overview](/en/nodes/overview/) — the building blocks you assemble in the editor.
- [Tutorial](/en/tutorials/) — complete workflows built step by step in the editor.
- [Template variables](/en/features/variables/) — the `{{variable}}` placeholder mechanism (distinct from workflow variables).
