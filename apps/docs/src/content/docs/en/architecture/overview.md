---
title: Architecture overview
description: Technical architecture of CtxFirst for contributors.
---

:::note
Technical source of truth: `ARCHITECTURE.md` and `CLAUDE.md` at the repo root. This page is a reader-oriented summary.
:::

## Monorepo

Yarn workspaces:

- `apps/desktop` — Electron app (main workspace).
- `apps/api` — Hapi server (placeholder).
- `apps/web` — web app (scaffolding).
- `apps/docs` — this documentation (Starlight).
- `packages/plugin-sdk` — `@ctxfirst/plugin-sdk`.

## The three Electron processes

- **Renderer** (`apps/desktop/src/`) — React 18 + TypeScript (Vite). Talks to the main process via `window.api.*`.
- **Main** (`apps/desktop/electron/main/`) — Node.js process. Isolates all native access (SQLite, CLI spawn, `shell.openExternal`) and registers the IPC handlers.
- **Preload** (`apps/desktop/electron/preload/`) — secure `contextBridge` bridge exposing a typed `window.api`.

## Hexagonal architecture (frontend)

The renderer follows a hexagonal architecture. See `ARCHITECTURE.md` for the dependency rules between layers and the feature-addition checklist.

## Security

`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, strict CSP. The renderer never imports Node builtins — everything goes through IPC.
