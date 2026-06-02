---
title: Plugin system
description: How CtxFirst is extended through plugins.
---

:::caution[Draft]
Page to enrich from the `@ctxfirst/plugin-sdk` and the bundled plugins.
:::

CtxFirst is extensible through **plugins**. The types intended for plugin authors are published in the `@ctxfirst/plugin-sdk` package (`packages/plugin-sdk/`).

## Plugins bundled with the app

Located in `apps/desktop/plugins-builtin/`:

- **hello-world** — minimal example plugin.
- **kanban** — Kanban board.
- **linear** — Linear integration.

## Writing a plugin

> To document: structure of a plugin, API exposed by the SDK, lifecycle, packaging.
