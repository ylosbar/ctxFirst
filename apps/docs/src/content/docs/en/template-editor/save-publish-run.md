---
title: Saving, publishing & running
description: Template identity, drafts vs published (immutable) templates, dependencies, and launching a run.
sidebar:
  order: 4
---

Once a graph is wired, the title bar and toolbar turn it into a saved, publishable, runnable template.

## Template identity

The **title bar** edits the template's identity inline: its **name**, its **reference (ID)**, its **version**, and a **description** (opened from the info popover). The reference and version together identify the template across runs and sub-workflow calls.

## Drafts & publishing

- **Save draft** persists the template to disk; its status stays `draft` and it remains editable.
- **Publish** freezes the template: _“A published ref is immutable: to iterate afterwards, bump the version (e.g. v2), which starts again from a draft.”_ A published template becomes invocable as a sub-workflow via [`workflow.call`](/en/nodes/workflow-call/). Once published, the save button is locked — _“Template published (immutable) — change the version to edit.”_

Other toolbar actions: **Reload the template data from disk** (discards unsaved edits) and **Clear everything and start over**.

## Dependencies

A template can reference resources that must exist in your environment — **skills** and **artifact types**. The toolbar surfaces them:

- **Template dependencies** — browse every resolved dependency.
- **Missing dependencies** — if a referenced resource is absent (e.g. after importing a template from JSON), a modal lists the missing skills and artifact types and which steps use them. Recreate the resources or replace the refs in the affected steps **before publishing**.

## Launching a run

The **Launch run** button opens a dialog that collects the inputs the run needs before starting:

- **Launch variables** — the [workflow variables](/en/template-editor/wiring-variables/) flagged **Prompt at launch** appear as form fields (required ones are badged). Pre-filled from their default value when present.
- **Input content** — if the entry step expects a seed artifact, you provide it here; the dialog shows the expected kind. A template that needs no input says so and starts directly.

Press **Start** to create the run and jump to the runs view. Launching requires a designated **entry** step (see [Adding & configuring nodes](/en/template-editor/nodes-and-inspector/)).

## See also

- [Sub-workflow](/en/nodes/workflow-call/) — how a published template is invoked from another.
- [Invoke sub-template](/en/nodes/template-invoke/) — spawn an isolated child instance of a template.
- [Wiring & variables](/en/template-editor/wiring-variables/) — the launch variables come from here.
