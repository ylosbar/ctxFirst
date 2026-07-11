# Electron shell, IPC, and the renderer

This page is a synthesis of [ARCHITECTURE.md §4, §5, §9, §10](/ARCHITECTURE.md)
and [CLAUDE.md](/CLAUDE.md), oriented toward "where do I plug in a new
capability". For workflow-engine internals see
[workflow-engine.md](workflow-engine.md); for the plugin/step-kind catalog see
[../domain/step-kinds-and-plugins.md](../domain/step-kinds-and-plugins.md).

## The three Electron processes

- **Main** — [apps/desktop/electron/main/index.ts](/apps/desktop/electron/main/index.ts).
  Node.js process. The only place allowed to touch native APIs: SQLite
  (`better-sqlite3`), `child_process` (spawning LLM CLIs, git, shell), `fs`,
  `shell.openExternal`, dialogs. Creates the `BrowserWindow`, registers all
  `ipcMain.handle` handlers, and boots every subsystem: the workflow engine
  ([wf/composition-root.ts](/apps/desktop/electron/main/wf/composition-root.ts)),
  chat service, explorer service, MCP server, plugin loader, perf monitor,
  Sentry.
- **Preload** — [apps/desktop/electron/preload/index.ts](/apps/desktop/electron/preload/index.ts).
  A `contextBridge` bridge. Exposes a typed `window.api` (published as
  `export type Api = typeof api`). **No business logic** — every entry is a
  thin forwarder to `ipcRenderer.invoke`/`ipcRenderer.on`.
- **Renderer** — [apps/desktop/src/](/apps/desktop/src/). React 18 +
  TypeScript, Vite bundle. Entry: [src/main.tsx](/apps/desktop/src/main.tsx) →
  [src/App.tsx](/apps/desktop/src/App.tsx). Talks to main **only** via
  `window.api.*`, and only from adapters under
  [src/infrastructure/electron/](/apps/desktop/src/infrastructure/electron/).

Shared code with no native access lives in
[apps/desktop/shared/](/apps/desktop/shared/) and is importable from both
main and renderer without breaking isolation (types, artifact-kind grammar,
port-acceptance rules, markdown rendering helpers — see
[workflow-engine.md § shared layer](workflow-engine.md#shared-layer-appsdesktopsharedwf)).

## Security model

`BrowserWindow` is created with `contextIsolation: true`, `sandbox: true`,
`nodeIntegration: false`, `webSecurity: true`
([electron/main/index.ts](/apps/desktop/electron/main/index.ts)). A strict CSP
is declared in [apps/desktop/index.html](/apps/desktop/index.html) and
hardened further in production via
[electron/main/csp.ts](/apps/desktop/electron/main/csp.ts). **Any new
external origin** (an API, a font CDN, a websocket) must be added to
`connect-src`/`font-src`/etc. — this is one of the ARCHITECTURE.md anti-drift
invariants (`iso-new-origin-csp`).

Renderer code must never `import` `child_process`, `fs`, or any Node
builtin — this is also enforced by ESLint rules in
[eslint.config.js](/eslint.config.js) (`iso-renderer-no-native`).

## Adding an IPC handler (3 touchpoints)

1. Define `ipcMain.handle("name", async (event, args) => ...)` in a module
   under [electron/main/ipc/](/apps/desktop/electron/main/ipc/), split by
   feature (`wf.ts`, `chat.ts`, `plugins.ts`, `settings.ts`, `system.ts`,
   `devlog.ts`, `shell.ts`, `explorer.ts`, `mcp.ts`, `maintenance.ts`).
2. Expose it in [electron/preload/index.ts](/apps/desktop/electron/preload/index.ts)
   via `ipcRenderer.invoke("name", args)` inside the `api` object.
3. Call it from the renderer via `window.api.<method>(...)` — **only** from
   an adapter in [src/infrastructure/electron/](/apps/desktop/src/infrastructure/electron/).

For main → renderer **streaming** (e.g. workflow events, chat tokens, dev
logs), the handler calls `event.sender.send("event-name", payload)` and the
preload exposes a `subscribe` helper that wraps `ipcRenderer.on`/`off` and
returns an unsubscribe function. Notable channels: `wf:event`,
`wf:llmSession`, `chat:event`, `devlog:line`, `wf:folders:changed`,
`wf:channelChanged`.

There is deliberately no fixed dev-server port contract:
`electron-vite` picks its own renderer port and the main process reads
`process.env.ELECTRON_RENDERER_URL`. Changes under `electron/main/**` or
`electron/preload/**` trigger an Electron relaunch; renderer changes hot
reload.

## Hexagonal architecture (both sides, same shape)

```
domain  ◄─────  application  ◄─────  adapters / infrastructure
(pure types    (use-cases +          (concrete implementations:
 & rules)       PORTS = outbound      SQLite, FS, LLM CLI,
                interfaces)           window.api, …)
                     ▲
                     │ composition root
                     └── instantiates adapters and injects them
```

Dependency rule (the most important one in the repo):

- **domain** imports only domain — never application, never adapters.
- **application** imports domain and its own ports (interfaces) — never a
  concrete adapter.
- **adapters** implement ports and may import domain types. This is the
  only layer allowed to touch native/IO.
- A single **composition root** per subsystem instantiates adapters and
  wires everything together.

This is the backend shape for the workflow engine
([wf/domain](/apps/desktop/electron/main/wf/domain/) /
[wf/application](/apps/desktop/electron/main/wf/application/) /
[wf/adapters](/apps/desktop/electron/main/wf/adapters/) /
[wf/composition-root.ts](/apps/desktop/electron/main/wf/composition-root.ts)),
for chat ([electron/main/chat/](/apps/desktop/electron/main/chat/)), and for
explorer ([electron/main/explorer/](/apps/desktop/electron/main/explorer/)).

### Renderer side

- **domain** — [src/domain/](/apps/desktop/src/domain/): pure types (workflow,
  chat, settings, explorer, plugin).
- **application/ports** — [src/application/ports/](/apps/desktop/src/application/ports/):
  `*-gateway` interfaces (workflow, chat, settings, system, plugin, folder,
  dev-log) + a task-repository port.
- **application/use-cases** — [src/application/use-cases/](/apps/desktop/src/application/use-cases/):
  ~60 thin `make…(gateway)` factories that call ports.
- **infrastructure/electron** — [src/infrastructure/electron/](/apps/desktop/src/infrastructure/electron/):
  the `electron-*-gateway` adapters — the **only** files allowed to call
  `window.api.*`. A parallel [src/infrastructure/mock/](/apps/desktop/src/infrastructure/mock/)
  exists for dev/tests.

### Dependency injection — `src/ui/di/`

[build-services.ts](/apps/desktop/src/ui/di/build-services.ts) is the
renderer's composition root: it creates the `createElectron*Gateway`
adapters, wires them to the `make*` use-cases, and returns a `Services`
object (typed in [services.ts](/apps/desktop/src/ui/di/services.ts)),
provided via React Context
([services-provider.tsx](/apps/desktop/src/ui/di/services-provider.tsx)).
Hooks and components consume `Services` — never the ports directly. This is
an anti-drift invariant (`fe-consume-services-di`).

## The workbench (VSCode-style shell)

Built on `dockview-react`, replacing an older AppShell/routing model — any
mention of "AppShell" elsewhere is stale. Key pieces, all under
[src/ui/workbench/](/apps/desktop/src/ui/workbench/):

- **Registry** — [registry.ts](/apps/desktop/src/ui/workbench/registry.ts): a
  pub/sub registry of contributions. Four contribution shapes:
  `ActivityContribution` (activity bar entry, optional route, "launcher"
  mode), `ViewContribution` (sidebar view, left/right/bottom, with
  `whenEditor`/`activity` eligibility and a persistent-or-contextual
  lifecycle), `EditorTypeContribution` (an editor type keyed by URI scheme,
  tab rendering, `getChatContext`), `FeatureHostContribution`
  (Providers/Overlays scoped to a feature).
- **Store** — [store.ts](/apps/desktop/src/ui/workbench/store.ts): zustand
  (editors, active editor, active activity, the `dockviewApi` handle). Prefs
  persist to `localStorage` under `ctxfirst:workbench:v1`
  ([prefs.ts](/apps/desktop/src/ui/workbench/prefs.ts)).
- **Reconciler** — [dock-reconciler.ts](/apps/desktop/src/ui/workbench/dock-reconciler.ts):
  view lifecycle engine (primary view selection, auto-show/hide by
  `autoShow` + lifecycle).
- **Router sync** — [WorkbenchRouterSync.tsx](/apps/desktop/src/ui/workbench/WorkbenchRouterSync.tsx):
  bidirectional mapping between the HashRouter URL and
  activity/editor state, driven entirely by what each contribution declares
  (`route`/`matchPath` on activities, `matchPath`/`toPath` on editor types) —
  there is **no hardcoded scheme table** in this file (anti-drift invariant
  `fe-routed-activity-declared`: a newly routed activity/editor declares its
  own mapping, it doesn't patch this file).
- **Shell** — [Workbench.tsx](/apps/desktop/src/ui/workbench/Workbench.tsx),
  [WorkbenchDock.tsx](/apps/desktop/src/ui/workbench/WorkbenchDock.tsx) (hosts
  `<DockviewReact>`), [ActivityBar.tsx](/apps/desktop/src/ui/workbench/ActivityBar.tsx).
  Both read the registry via `useSyncExternalStore` so late registrations
  (e.g. from plugins) still trigger a re-render.

### Features & contributions

A **feature** = a self-contained folder under
[src/ui/features/](/apps/desktop/src/ui/features/) with a `contributions.ts`
that registers its activities/views/editors into the workbench registry.
Current features: `overview`, `explorer`, `runs`, `schedules`, `templates`,
`skills`, `artifact-schemas`, `chat`, `terminal`, `settings`. Registration
happens by side-effect import — `register-contributions.ts` imports every
feature's `contributions.ts`. `chat` and `terminal` are global "launcher"
views (toggled, not full-screen activities). **Branching a feature into the
shell without going through `contributions.ts` is an anti-drift violation**
(`fe-feature-via-contributions`).

To add a new feature area: create the folder, write `contributions.ts`
registering whatever `ActivityContribution`/`ViewContribution`/
`EditorTypeContribution` you need, import it from
[register-contributions.ts](/apps/desktop/src/ui/workbench/register-contributions.ts),
and consume `Services` (never gateways directly) from your components/hooks.

### Stores, query, i18n

- **Stores** — [src/ui/stores/](/apps/desktop/src/ui/stores/): zustand stores
  scoped by concern (appearance, template-canvas, skill-editor,
  artifact-schema-editor, run-panel, review-editor, runs, explorer-view…).
  Editor/canvas stores expose the "handle" read by `getChatContext`.
- **Query** — [src/ui/query/](/apps/desktop/src/ui/query/): react-query with
  `staleTime: Infinity`; a `WorkflowEventsBridge` listens to `wf:event` and
  invalidates queries — **cache invalidation is event-driven, not polling**
  (anti-drift invariant `fe-query-invalidated-by-events`).
- **i18n** — [src/ui/i18n/](/apps/desktop/src/ui/i18n/): i18next, with
  `i18next/no-literal-string` enforced by ESLint. Migration in progress —
  `StepInspector`, `StepNode`, `StepInfoPanel` are known pre-existing
  exceptions, not regressions to fix opportunistically.

### Design system

[src/components/ui/](/apps/desktop/src/components/ui/) holds shadcn/ui
primitives on `@base-ui/react` (button, card, input, select, dialog,
popover, tooltip…) with Storybook stories.
[src/ui/components/](/apps/desktop/src/ui/components/) holds reusable
business components (`ArtifactView`, `StepInfoPanel`, `LlmSessionPanel`,
`WorkflowStartForm`, badges, toolbars…). A migration off raw
`<button>`/`<input>`/`<select>`/`<textarea>` toward the design system is in
progress — see [scripts/audit-raw-jsx-elements.js](/scripts/audit-raw-jsx-elements.js).

## React component convention

Components must be `const` arrow functions with `export default` on its own
line — never a `function` declaration, never an inline `export default`:

```tsx
const Component = (props: PropsType) => { /* … */ }

export default Component
```

This is enforced as a (warning-level) anti-drift invariant
(`conv-react-component-style`).

## Secondary workspaces

- **`apps/api`** (`@ctxfirst/api`) — [apps/api/src/server.ts](/apps/api/src/server.ts):
  a Hapi server exposing only `GET /` (healthcheck) and `POST /webhook` (dev
  webhook receiver), on `localhost:3001` by default (`HOST`/`PORT`
  overridable). **Not yet wired to the desktop app.** When a real backend is
  needed, the planned integration is: an HTTP adapter under
  `src/infrastructure/http/` implementing an `application/ports/` interface,
  a typed client codegen'd from the backend's OpenAPI schema (never
  hand-written — anti-drift invariant `conv-no-handwritten-api-types`), the
  backend origin added to the CSP, and the URL exposed via `VITE_API_URL`.
- **`apps/web`** (`@ctxfirst/web`) — Vite + React 18 + Tailwind v4 +
  shadcn/ui scaffold, no business feature yet.

## What to check when changing this area

- `yarn lint` — several invariants above are ESLint rules, not just prose.
- If you touch preload or main/renderer boundaries, re-verify all three IPC
  touchpoints (handler, preload, renderer adapter) are in sync — a stale
  preload type is a common source of silent runtime breakage.
- If you add a network origin, update the CSP in
  [apps/desktop/index.html](/apps/desktop/index.html) and
  [electron/main/csp.ts](/apps/desktop/electron/main/csp.ts).
- Workbench/feature changes: check `register-contributions.ts` wiring and
  make sure routing lives in the contribution, not in
  `WorkbenchRouterSync.tsx`.
