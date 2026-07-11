# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout (monorepo)

```
tauri-app/
├── apps/
│   ├── desktop/             ← app Electron (React + Node main process) — workspace principal
│   │   ├── electron/        ← main + preload
│   │   ├── src/             ← renderer (React)
│   │   ├── shared/          ← types/fonctions partagés main ↔ renderer
│   │   └── plugins-builtin/ ← plugins livrés avec l'app (hello-world, kanban, linear)
│   ├── api/                 ← serveur Hapi (Node, TS) — placeholder, expose `/` et `/webhook` sur :3001
│   └── web/                 ← app web Vite + React + Tailwind v4 + shadcn/ui (scaffolding)
├── packages/
│   └── plugin-sdk/          ← @ctxfirst/plugin-sdk (types pour auteurs de plugins)
├── justfile                 ← commandes cross-stack
└── package.json             ← yarn workspaces (apps/*, packages/*)
```

Specs de référence à lire avant toute modification structurante :
- [ARCHITECTURE.md](ARCHITECTURE.md) — architecture hexagonale du frontend.

Le workspace principal est **`apps/desktop`** (l'app Electron). `apps/api` et `apps/web` sont des workspaces secondaires, actuellement à l'état de scaffolding — voir § "Workspaces secondaires".

## Commandes

Package manager JS : **yarn** (workspaces).

Depuis la racine :
- `yarn dev` — lance l'app Electron en mode dev (electron-vite, HMR renderer).
- `yarn start` — lance l'app empaquetée en mode preview (`electron-vite preview`).
- `yarn build` — typecheck + bundle (main + preload + renderer) dans `apps/desktop/out/`.
- `yarn package` — build + binaire distribuable (`electron-builder`).
- `yarn web:dev` / `yarn web:build` / `yarn web:preview` — workspace `@ctxfirst/web` (Vite).
- `yarn api:dev` / `yarn api:build` / `yarn api:start` — serveur Hapi sur `localhost:3001` par défaut (override via `PORT` / `HOST`), workspace `@ctxfirst/api`, [apps/api/src/server.ts](apps/api/src/server.ts).
- `yarn test` / `yarn test:watch` / `yarn test:coverage` — Vitest (runner configuré côté desktop, voir [apps/desktop/vitest.config.ts](apps/desktop/vitest.config.ts)).
- `yarn lint` / `yarn lint:fix` — ESLint 9 flat config ([eslint.config.js](eslint.config.js)). Encode les règles d'architecture (renderer ↛ Node, dépendance hexagonale, convention composant React). `yarn lint:changed` ne lint que les fichiers modifiés vs `main`.

Workspace desktop direct (`yarn workspace @ctxfirst/desktop <script>`) :
- `typecheck` — `tsc --noEmit`.
- `wipe-db` — vide la base SQLite + artifacts (dev + packagé). Aussi disponible via `just desktop-wipe-db`.
- `storybook` / `build-storybook` — Storybook (port 6006).

Raccourcis `just` équivalents dans [justfile](justfile).

Ne pas démarrer les serveurs de dev (`yarn dev`, `yarn start`, `yarn storybook`) à moins que ça soit explicitement demandé.

## Convention de nommage des branches

Format : `<type>/<description-en-kebab-case>`.

- **`<type>`** en minuscules, dans la liste fermée : `feat` (fonctionnalité), `fix` (correctif), `refactor` (refonte sans changement de comportement), `docs` (documentation), `ci` (pipeline / outillage CI), `chore` (maintenance, déps, config).
- **`<description>`** en minuscules, mots séparés par des tirets (`-`), concise et descriptive. Pas d'espaces, pas de majuscules, pas de underscores, pas de `/` supplémentaire.
- Les phases d'un même chantier se suffixent par leur numéro : `refactor/template-editor-phase-0-3`.

Exemples valides : `feat/select-markdown-node`, `fix/persist-inline-template-rename`, `docs/plugin-system`, `refactor/template-editor-phase-0-3`.

Le titre de PR mergée suit la même casse que la branche ; le slash et la convention de type rendent l'historique des merges lisible.

## Architecture

Le frontend suit une architecture hexagonale — voir [ARCHITECTURE.md](ARCHITECTURE.md) pour les règles de dépendance, la structure des couches et la checklist d'ajout de fonctionnalité. À lire avant toute modification côté `apps/desktop/src/`.

Trois processus dans `apps/desktop/` (app Electron) :

- **Renderer** ([apps/desktop/src/](apps/desktop/src/)) — React 18 + TypeScript, bundle Vite. Entry : [apps/desktop/src/main.tsx](apps/desktop/src/main.tsx) → [apps/desktop/src/App.tsx](apps/desktop/src/App.tsx). Le renderer parle au main via `window.api.*` (exposé par le preload).

### React component style

React components must be written as arrow-function consts with a default export on a separate line:

```tsx
const Composant = (props: PropsType) => {}

export default Composant
```

Do not use `function` declarations or inline `export default` on the component definition.

- **Main** ([apps/desktop/electron/main/](apps/desktop/electron/main/)) — process Node.js d'Electron. Entry : [apps/desktop/electron/main/index.ts](apps/desktop/electron/main/index.ts). Crée la `BrowserWindow`, enregistre les handlers IPC (`ipcMain.handle`), et isole tout accès natif (spawn de CLI, `shell.openExternal`, accès SQLite via `better-sqlite3`) ici — jamais dans le renderer.
- **Preload** ([apps/desktop/electron/preload/index.ts](apps/desktop/electron/preload/index.ts)) — pont sécurisé entre renderer et main. Expose une API typée `window.api` via `contextBridge`. Aucune logique métier ici, juste du forwarding IPC.

Code partagé main ↔ renderer (types, helpers purs) sous [apps/desktop/shared/](apps/desktop/shared/) — importable des deux côtés sans casser l'isolation.

### Adding an IPC handler

Round-trip wiring has three touchpoints:

1. Define an `ipcMain.handle("name", async (event, args) => ...)` in [apps/desktop/electron/main/](apps/desktop/electron/main/) (split by feature under `ipc/`).
2. Expose it in [apps/desktop/electron/preload/index.ts](apps/desktop/electron/preload/index.ts) via `ipcRenderer.invoke("name", args)` inside the `api` object (its type is published as `Api = typeof api`).
3. Call it from the renderer via `window.api.<method>(...)` — only inside an adapter under [apps/desktop/src/infrastructure/electron/](apps/desktop/src/infrastructure/electron/).

For main→renderer streaming, use `event.sender.send("event-name", payload)` in the handler, and expose a subscribe helper in the preload that wraps `ipcRenderer.on/off` and returns an unsubscribe function.

### Security preferences

The `BrowserWindow` uses `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`. A strict CSP is declared in [apps/desktop/index.html](apps/desktop/index.html). Any new external origin (API, font CDN, websocket) must be added to `connect-src` / `font-src` / etc. Renderer code must never import `child_process`, `fs`, or other Node builtins — all native access goes through the main process via IPC.

### Dev server quirks

- `electron-vite` picks its own renderer port; no fixed port contract between Vite and the main process (main reads `process.env.ELECTRON_RENDERER_URL`).
- HMR applies to the renderer; changes to `electron/main/**` or `electron/preload/**` trigger a relaunch of the Electron process.

## OpenWiki

This repository has documentation located in the /openwiki directory.

Start here:
- [OpenWiki quickstart](openwiki/quickstart.md)

OpenWiki includes repository overview, architecture notes, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

When working in this repository, read the OpenWiki quickstart first, then follow its links to the relevant architecture, workflow, domain, operation, and testing notes.

## Workspaces secondaires

### `apps/api` — serveur Hapi

Workspace `@ctxfirst/api` ([apps/api/src/server.ts](apps/api/src/server.ts)). Sert pour l'instant uniquement à recevoir des webhooks de dev (`POST /webhook`) + un healthcheck (`GET /`). Pas encore couplé au desktop. Hôte et port configurables via `HOST` / `PORT` (défaut `localhost:3001`), CORS ouvert.

Quand un vrai backend sera nécessaire, l'intégration côté desktop prendra la forme :
1. Un adapter HTTP dans `apps/desktop/src/infrastructure/http/` (à créer) qui implémente un port de `application/ports/`.
2. Un client TS typé, généré depuis l'OpenAPI du backend (codegen à mettre en place), consommé uniquement par cet adapter.
3. L'origine du backend ajoutée au `connect-src` de la CSP dans [apps/desktop/index.html](apps/desktop/index.html).
4. URL exposée via `VITE_API_URL`.

Ne pas écrire de types d'API partagés à la main — toujours passer par la génération depuis le schéma du backend.

### `apps/web` — app web

Workspace `@ctxfirst/web` : scaffolding Vite + React 18 + Tailwind v4 + shadcn/ui ([apps/web/src/App.tsx](apps/web/src/App.tsx)). Pas encore de feature métier ; sert de socle pour une future surface web.
