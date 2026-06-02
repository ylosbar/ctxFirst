---
title: Vue d'ensemble de l'architecture
description: Architecture technique de CtxFirst pour les contributeurs.
---

:::note
Source de vérité technique : `ARCHITECTURE.md` et `CLAUDE.md` à la racine du repo. Cette page en est un résumé orienté lecteur.
:::

## Monorepo

Yarn workspaces :

- `apps/desktop` — app Electron (workspace principal).
- `apps/api` — serveur Hapi (placeholder).
- `apps/web` — app web (scaffolding).
- `apps/docs` — cette documentation (Starlight).
- `packages/plugin-sdk` — `@ctxfirst/plugin-sdk`.

## Les trois processus Electron

- **Renderer** (`apps/desktop/src/`) — React 18 + TypeScript (Vite). Parle au main via `window.api.*`.
- **Main** (`apps/desktop/electron/main/`) — process Node.js. Isole tout accès natif (SQLite, spawn CLI, `shell.openExternal`) et enregistre les handlers IPC.
- **Preload** (`apps/desktop/electron/preload/`) — pont sécurisé `contextBridge` exposant une API typée `window.api`.

## Architecture hexagonale (frontend)

Le renderer suit une architecture hexagonale. Voir `ARCHITECTURE.md` pour les règles de dépendance entre couches et la checklist d'ajout de fonctionnalité.

## Sécurité

`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, CSP stricte. Le renderer n'importe jamais de builtins Node — tout passe par IPC.
