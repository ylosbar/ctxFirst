---
title: The canvas
description: Navigate the workflow graph — drag vs box-select modes, grid snap, auto-layout, groups, sticky notes, and export.
sidebar:
  order: 1
---

The canvas is the React Flow graph at the center of the editor. It holds the `Start` entry marker, the step [nodes](/en/nodes/overview/), the transitions between them, the [variable pills](/en/template-editor/wiring-variables/) that flow along edges, and optional groups and sticky notes.

## Navigation & modes

The canvas has two interaction modes, toggled from the toolbar:

- **Drag / pan** _(default)_ — left-drag moves the viewport; click a node or edge to select it.
- **Box select** — left-drag draws a selection rectangle to multi-select nodes (partial containment counts); middle- or right-drag still pans. Press `Esc` to leave box-select mode.

Zoom with the mouse wheel; the minimap and zoom controls sit in a corner of the canvas.

## Grid snap

A toolbar toggle snaps nodes to a grid as you move them. The **grid step** (size in pixels) is chosen from the adjacent menu and is remembered per editor.

## Auto-layout

Three toolbar actions re-arrange the graph automatically (group-aware):

- **Stack vertically** — top-to-bottom flow.
- **Align horizontally** — left-to-right flow.
- **Stack in two columns** — a compact two-column layout.

## Groups & sticky notes

- **Groups** — draw a frame around a set of nodes to group them visually; the group can be labelled and deleted (the nodes inside are kept).
- **Sticky notes** — **Add a note** drops a free-form annotation on the canvas; a toolbar toggle shows or hides all notes. Notes are documentation only — they never execute.

## Fullscreen & export

- **Fullscreen** expands the editor to the whole window (`Esc` to exit).
- **Export the workflow** offers three formats: **Export as JSON** (the template definition, re-importable), **Export as SVG**, and **Export as PNG** (an image of the graph).

## See also

- [Wiring & variables](/en/template-editor/wiring-variables/) — what the transitions and variable pills mean.
- [Adding & configuring nodes](/en/template-editor/nodes-and-inspector/) — populating the canvas.
- [Saving, publishing & running](/en/template-editor/save-publish-run/) — turning a graph into a run.
