# OpenWiki Quickstart — CtxFirst

## What this repository is

**CtxFirst** is a desktop application (Electron + React) for designing and
running **LLM-driven workflows step by step**. A user builds a *template*
(a graph of typed nodes/"steps" wired together), launches it as a *run*
(an *instance*), and the engine walks the graph, calling LLMs (Claude Code,
Codex CLI, OpenRouter) and tools (shell, git, GitLab, Linear, webhooks) at
each step. Human validation gates and LLM "judge" nodes can pause a run or
reject an output and re-open a **feedback loop** back to an earlier step,
so the user can iterate without restarting the whole workflow.

Three ideas shape almost everything in the codebase — see
[architecture/workflow-engine.md](architecture/workflow-engine.md) for detail:

- **Event sourcing** — all execution state derives from an append-only event
  log; readable state is a pure projection of that log.
- **Artifacts, not shared sessions** — steps never share an LLM session; they
  exchange typed *artifacts* only, so every step gets a fresh context.
- **Hexagonal architecture (ports & adapters)** — `domain → application
  (ports) → adapters`, applied independently on both the Electron main
  process and the React renderer. Dependencies never point outward.

The product name is **CtxFirst**; the repo/package scope is historically
`@ctxfirst/*` and persistence keys use `wf_` / `ctxfirst:` prefixes — this
mixed branding is intentional, not a bug to fix.

## Where to go next

| Section | What it covers |
| --- | --- |
| [architecture/electron-and-renderer.md](architecture/electron-and-renderer.md) | The 3 Electron processes, security model, IPC contract, renderer hexagonal layering, workbench shell/DI |
| [architecture/workflow-engine.md](architecture/workflow-engine.md) | The `wf/` engine: domain model, event sourcing, orchestrator, judge/loop/retry, channels, scheduler, parsers |
| [domain/step-kinds-and-plugins.md](domain/step-kinds-and-plugins.md) | Catalog of step kinds (business logic), the plugin system, chat agent ("Pi"), MCP server |
| [operations/persistence-build-and-ops.md](operations/persistence-build-and-ops.md) | SQLite schema/migrations, artifact store, settings/secrets, commands, CI, known pitfalls |

## Canonical existing documentation (read these too)

This repo already has strong, actively maintained documentation. OpenWiki is
a **synthesis and navigation layer** on top of it — it does not replace it:

- [ARCHITECTURE.md](/ARCHITECTURE.md) (generated from `ARCHITECTURE.json` by
  [scripts/architecture.js](/scripts/architecture.js)) — the most detailed,
  authoritative architecture reference, including a checklist of anti-drift
  invariants. **If OpenWiki and `ARCHITECTURE.md` ever disagree, trust
  `ARCHITECTURE.md` and the code.**
- [CLAUDE.md](/CLAUDE.md) — commands, branch naming, React component
  conventions, and the three-touchpoint recipe for adding an IPC handler.
- [apps/desktop/electron/main/wf/GLOSSARY.md](/apps/desktop/electron/main/wf/GLOSSARY.md) —
  plain-language glossary of every workflow-engine concept
  (`WorkflowTemplate`, `StepExecution`, `DomainEvent`, `FeedbackLoop`, …).
- [packages/plugin-sdk/README.md](/packages/plugin-sdk/README.md) — how to
  author a plugin (manifest, permissions, main/renderer halves).
- [apps/docs/src/content/docs/](/apps/docs/src/content/docs/) — the public
  Starlight documentation site (FR/EN): exhaustive per-node reference under
  `nodes/`, template editor usage under `template-editor/`, and the artifact
  type system under `type-system/`. Built with `yarn docs:dev` /
  `yarn docs:build`.
- [specs/](/specs/) — feature specs, often **ahead of the shipped code**.
  Useful for intent and history, but not proof a feature exists — verify
  against the code.

## Repository layout

Yarn workspaces monorepo (historically named `tauri-app`, but it is **not**
Tauri/Rust):

```
apps/
├── desktop/   @ctxfirst/desktop  — the product: Electron app (PRIMARY workspace)
├── api/       @ctxfirst/api      — Hapi server placeholder (dev webhooks on :3001), not yet wired to desktop
├── web/       @ctxfirst/web      — Vite/React/Tailwind scaffold, no features yet
└── docs/      @ctxfirst/docs     — Astro Starlight public docs site (FR/EN)
packages/
└── plugin-sdk/ @ctxfirst/plugin-sdk — MIT-licensed, type-only SDK for plugin authors
specs/     — feature specs (see caveat above)
scripts/   — architecture doc generator + code audits (large components, raw JSX, markdown links, i18n)
```

`apps/api` and `apps/web` are secondary scaffolding — see
[ARCHITECTURE.md § Workspaces secondaires](/ARCHITECTURE.md) /
[CLAUDE.md § Workspaces secondaires](/CLAUDE.md) before investing real work there.

## Tech stack at a glance

Electron + electron-vite · React 18 + TypeScript · dockview-react (VSCode-style
workbench) · `@xyflow/react` (React Flow, template editor canvas) · zustand +
`@tanstack/react-query` · react-router v7 (HashRouter) · shadcn/ui on
`@base-ui/react` + Tailwind · CodeMirror 6 · zod v4 · `better-sqlite3` (WAL) +
content-addressed artifact store on disk · `croner` (schedules) ·
`quickjs-emscripten` (sandboxed parser "code" mode) ·
`@earendil-works/pi-coding-agent` (in-app chat agent, "Pi") ·
`@modelcontextprotocol/sdk` (in-app MCP server) · i18next · Vitest + Storybook
· ESLint 9 flat config (encodes several architecture rules).

Full table: [ARCHITECTURE.md § 3](/ARCHITECTURE.md).

## Running, building, testing

From the repo root (package manager is **yarn**, workspaces):

```bash
yarn install     # installs + rebuilds better-sqlite3 for Electron
yarn dev         # launches the desktop app (electron-vite, renderer HMR)
yarn build       # typecheck + bundle (main + preload + renderer)
yarn package     # build + distributable binary (electron-builder)
yarn test        # Vitest (config lives in apps/desktop/vitest.config.ts)
yarn lint        # ESLint 9 flat config — encodes several architecture rules
```

Prerequisites: Node + yarn, and the `claude` CLI installed and authenticated
(the app spawns `claude -p --output-format stream-json` for the
`claude_code.invoke` / `claude_code.judge` step kinds).

Do **not** start dev servers (`yarn dev`, `yarn start`, `yarn storybook`)
unless explicitly asked to — this is called out repeatedly in
[CLAUDE.md](/CLAUDE.md).

Secondary workspaces have their own scripts: `yarn web:dev/build/preview`,
`yarn api:dev/build/start`, `yarn docs:dev/build/preview`. Desktop-only
scripts (`typecheck`, `wipe-db`, `storybook`) run via
`yarn workspace @ctxfirst/desktop <script>` or the [justfile](/justfile)
shortcuts.

⚠️ `yarn typecheck` / `yarn build` currently fail on two pre-existing
`TS2688` errors from `@types/hapi__catbox` / `shot` (unrelated to
application code) — see [ARCHITECTURE.md § 12](/ARCHITECTURE.md). Don't
attribute these to your own change; verify the bundle with
`electron-vite build` directly if needed.

## Licensing note (relevant to what you touch)

CtxFirst is dual-licensed: the desktop app is AGPL-3.0-or-later, while
`packages/plugin-sdk` is MIT so third parties can build closed-source
plugins. Contributions are accepted under the DCO — see
[CONTRIBUTING.md](/CONTRIBUTING.md) and [COMMERCIAL.md](/COMMERCIAL.md).

## Before you change code

1. Read [ARCHITECTURE.md](/ARCHITECTURE.md) fully at least once — it has a
   checklist of "anti-drift" invariants (e.g. renderer never touches
   Node/native APIs, `domain` never imports `application`/`adapters`, a new
   step kind is a new runner file, not an orchestrator change).
2. Run `yarn lint` — many of those invariants are ESLint rules, not just
   prose.
3. Colocate tests (`*.test.ts(x)`, Vitest) with the code you change; most
   `wf/` domain and application files already have one.
