# Persistence, build, testing & operations

This page covers the infrastructure and tooling layer: SQLite schema and
migrations, the content-addressed artifact store, settings and secrets,
explorer, build/test/lint commands, CI, known pitfalls, and the maintenance
scripts under `scripts/`.

## SQLite database — [electron/main/db/](/apps/desktop/electron/main/db/)

- Singleton `better-sqlite3` at `<userData>/app.db`, `journal_mode = WAL`,
  `foreign_keys = ON`.
- Versioned migration runner using the `user_version` pragma; applies pending
  migrations in a single transaction.
- Migrations live in [db/migrations.ts](/apps/desktop/electron/main/db/migrations.ts)
  (28+ migrations); tests in [migrations.test.ts](/apps/desktop/electron/main/db/migrations.test.ts).

### Key tables (prefix `wf_` for workflow engine)

| Table | Purpose |
|---|---|
| `wf_events` | Append-only event-sourced execution log (the source of truth for all instance state). |
| `wf_artifacts` | Content-addressed artifact metadata (kind + hash + storageRef; content is on disk, **not** in the DB — `wf-artifact-content-not-in-db`). |
| `wf_runs` | Per-step-execution LLM invocation records (tokens, cost, latency, prompt hash). |
| `wf_templates` | Workflow templates (id + version composite PK, JSON steps/transitions/variables). |
| `wf_skills` | Reusable versioned system prompts. |
| `wf_llm_session_events` | Buffered LLM session events per step execution (for late panel open / replay). |
| `app_settings` | Key-value settings (API keys, preferences). |
| `wf_artifact_schemas` | User-defined artifact type schemas (simplifiedSchema, rawSchema, sample, structural_hash, extends_kind). |
| `wf_parsers` | Declarative/code parsers for artifact transforms. |
| `wf_parser_runs` | Audit log of parser executions. |
| `plugin_grants` | Per-(plugin, version) authorization grants. |
| `channels` | User-defined context scopes (seeded with `personal` default). |
| `explorer_folders` / `explorer_folder_items` | Per-channel folder tree for resource organization. |
| `chat_sessions` | Pi chat session index (JSONL path, model, initial context, system_prompt snapshot). |
| `wf_schedules` | Cron-based workflow scheduling. |

Notable migrations: v11 (rename `llm.invoke` → `claude_code.invoke`), v17
(fold `TechSpec`/`CodePatch`/etc → `Markdown`), v23 (`LinearTicket` →
`plugin:linear:Ticket@v1`), v25 (`MarkdownList`/`PathList` → canonical
`List<...>` form).

## Artifact store — [wf/adapters/artifact-store/](/apps/desktop/electron/main/wf/adapters/artifact-store/)

Artifact **content** is never stored in SQLite — it lives on disk in a
content-addressed store:

- `<sha256>.bin` — raw content bytes.
- `<sha256>.meta.json` — metadata (kind, hash, etc.).
- Deduplicated by hash (same content = same file).
- The DB only carries `kind + hash + storageRef` metadata.
- The `ArtifactStore` port validates payloads against the kind's Zod schema
  before writing.

The artifacts directory is under `<userData>/artifacts`. Migration scripts in
the same directory handle legacy artifact kind/shape transitions
(`migrate-removed-kinds.ts`, `migrate-linearref-shape.ts`,
`migrate-linearticket-to-plugin.ts`, `migrate-artifact-meta.ts`).

## Settings & secrets — [electron/main/settings/](/apps/desktop/electron/main/settings/)

[`SettingsStore`](/apps/desktop/electron/main/settings/store.ts) persists to
the `app_settings` table. Secrets (API keys, tokens) are encrypted via
Electron's `safeStorage` (OS keychain/keyring); on Linux without a keyring,
falls back to `plain:`-prefixed base64 (tagged so it can be detected).

| Key | Encrypted | Purpose |
|---|---|---|
| `linear.apiKey` | Yes | Linear API key. |
| `gitlab.accessToken` | Yes | GitLab access token. |
| `openrouter.apiKey` | Yes | OpenRouter API key. |
| `openrouter.defaultModel` | No | Default model (fallback: `openai/gpt-4o-mini`). |
| `openrouter.models` | No | JSON array of curated model IDs. |
| `chat.systemPrompt` | No | User-edited base system prompt (max 8192 chars). |
| `ui.activeChannelId` | No | Last selected channel. |
| `dev.perfMonitoring` | No | Dev perf monitor toggle. |

`clearAll()` = factory reset (wipes app_settings, but not the full DB —
that's `app:factoryReset` in the maintenance IPC).

## Explorer — [electron/main/explorer/](/apps/desktop/electron/main/explorer/)

A hexagonal subsystem for organizing runs/templates into folders per channel.
Tables: `explorer_folders` (self-referencing parent_id tree, channel-scoped)
and `explorer_folder_items` (resource → folder assignment). Exposes
`ExplorerService` with an `onChanged` EventEmitter that notifies on
mutations. IPC channels: `wf:folders:list/create/rename/delete/move/assign`,
push `wf:folders:changed`.

## Commands reference

From the repo root (package manager: **yarn** with workspaces):

```bash
yarn install              # installs + rebuilds better-sqlite3 for Electron
yarn dev                  # launches desktop app (electron-vite, renderer HMR)
yarn build                # typecheck + bundle (main + preload + renderer)
yarn package              # build + distributable binary (electron-builder)
yarn test                 # Vitest (config: apps/desktop/vitest.config.ts)
yarn test:watch           # Vitest in watch mode
yarn test:coverage        # Vitest with V8 coverage
yarn lint                 # ESLint 9 flat config
yarn lint:fix             # ESLint with --fix
yarn lint:changed         # lint only files changed vs main
```

Desktop workspace direct (`yarn workspace @ctxfirst/desktop <script>`):

```bash
typecheck                 # tsc --noEmit
wipe-db                   # wipe SQLite + artifacts (dev + packaged)
storybook / build-storybook  # Storybook (port 6006)
```

Secondary workspaces: `yarn web:dev/build/preview`, `yarn api:dev/build/start`,
`yarn docs:dev/build/preview`.

`just` shortcuts are available in the [justfile](/justfile). Do **not** start
dev servers (`yarn dev`, `yarn start`, `yarn storybook`) unless explicitly
asked — this is called out in [CLAUDE.md](/CLAUDE.md).

### Known build pitfall

`yarn typecheck` / `yarn build` currently fail on two pre-existing `TS2688`
errors from `@types/hapi__catbox` / `shot` (unrelated to application code). The
bundle can still be verified via `electron-vite build` directly. See
[ARCHITECTURE.md § 12](/ARCHITECTURE.md).

## ESLint architecture rules

[eslint.config.js](/eslint.config.js) (flat config, ~400 lines) encodes many
of the ARCHITECTURE.md anti-drift invariants as actual rules:

- **Renderer isolation**: bans importing `electron`, `better-sqlite3`,
  `child_process`, `fs`, `path`, `os` in `src/**`.
- **Hexagonal dependency**: `domain/**` may only depend on itself;
  `application/**` may depend on domain + ports only; `window.api` usage
  banned outside `src/infrastructure/electron/`.
- **WF engine isolation**: `wf/domain/**` bans all I/O and application/adapter
  imports; `wf/application/**` bans adapter and I/O imports.
- **Shared layer**: `shared/**` must not depend on `@/*`, `electron/**`, or
  any I/O.
- **React component style**: `func-style: expression` + no inline
  `export default` in `src/ui/**/*.tsx` / `src/components/**/*.tsx`.
- **i18n**: `i18next/no-literal-string` enforced in `src/**/*.tsx` (excluding
  design system, i18n config, stories, tests).
- **Test files**: relaxed rules (`no-explicit-any` off,
  `no-non-null-assertion` off, `no-floating-promises` off).

## Testing

- **Runner**: Vitest, config in [vitest.config.ts](/apps/desktop/vitest.config.ts).
- **Two projects**: `node` (electron + src + shared + plugins-builtin) and
  `storybook` (Playwright/chromium via `@storybook/addon-vitest/vitest-plugin`).
- **Colocation**: `*.test.ts(x)` next to source files — most `wf/domain`,
  `wf/application`, `wf/plugins`, `shared/wf`, and `src/**` files have one.
- **Coverage**: V8 provider, includes `electron/main/wf/domain/`,
  `electron/main/wf/application/`, `src/application/`, `src/domain/`.
- **Pattern**: WF domain/application tests use fake `deps` objects implementing
  only the needed ports (see `wf/__tests__/fixtures/` for shared fakes like
  `fake-llm.ts`, `fake-registries.ts`, `fake-linear.ts`). Runner tests verify
  `resolveSpec` and `run` in isolation. Renderer tests cover template editor
  graph transforms, run timeline flattening, and use-case logic.
- **Aliases**: `@` → `./src`, `@shared` → `./shared`.

## Scripts — [scripts/](/scripts/)

| Script | Purpose |
|---|---|
| `architecture.js` | `gen` (regenerate ARCHITECTURE.md from ARCHITECTURE.json), `check` (CI guard — fails if MD is stale), `extract <scope>`, `resolve <path...>` (find invariants for changed files). |
| `audit-large-components.js` | Lists React components exceeding a line threshold (default 500, via TS AST). |
| `audit-markdown-links.js` | Audits markdown links in `.md` files for broken references. |
| `audit-raw-jsx-elements.js` | Flags raw HTML elements (`<button>`, `<input>`, ...) that should use design system components. |
| `audit-untranslated-strings.js` | Finds user-facing strings not passing through i18n (broader than ESLint rule). |
| `count-loc.js` | Counts LOC by extension and workspace via `git ls-files`. |
| `find-eslint-rule.js` | Finds which ESLint config enables a given rule. |
| `dev-restart.sh` | Kills any previous `yarn dev` process group before relaunching (used by VSCode task). |

## CI

[.github/workflows/](/.github/) — CI runs lint, typecheck, tests, and the
architecture check (`yarn arch:check` — fails if `ARCHITECTURE.md` is stale
vs `ARCHITECTURE.json`). See the CI badge in [README.md](/README.md).

## Architecture doc generation

`ARCHITECTURE.md` is **generated** from `ARCHITECTURE.json` by
`scripts/architecture.js` — never edit the `.md` by hand. The `ARCHITECTURE.json`
file is the source; `yarn arch:gen` regenerates the `.md`, and `yarn arch:check`
guards staleness in CI. The JSON file also carries the anti-drift invariant
definitions with their scopes and severity levels.

## Factory reset

`app:factoryReset` (IPC in [ipc/maintenance.ts](/apps/desktop/electron/main/ipc/maintenance.ts))
wipes all SQLite tables, removes on-disk data directories (`artifacts`,
`pi-sessions`, `pi-cwd`, `channel-icons`), kills legacy profiles, and exits
the process. For dev-only DB wipes without exiting, use
`yarn workspace @ctxfirst/desktop wipe-db`.
