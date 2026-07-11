# Step kinds, plugins, chat & MCP

This page covers the **business logic surface** of CtxFirst: the catalog of
step kinds (node types) that runners implement, the plugin system that lets
third parties extend the engine and UI, the in-app chat agent ("Pi"), and the
MCP server that exposes workflow assets to tools.

For the engine architecture (how runners are dispatched, event sourcing,
orchestrator) see
[../architecture/workflow-engine.md](../architecture/workflow-engine.md). For
the runner contract (`StepRunner`, `RunContext`, `StepOutcome`) see
[`step-runner.ts`](/apps/desktop/electron/main/wf/application/step-runner.ts).

## Step kind catalog

Every step kind is a `StepRunner` file in
[`apps/desktop/electron/main/wf/plugins/`](/apps/desktop/electron/main/wf/plugins/)
registered via `runners.register(...)` in
[`wf/composition-root.ts`](/apps/desktop/electron/main/wf/composition-root.ts).
The composition root is the **source of truth** for which kinds are actually
active — some files in `wf/plugins/` exist but are not wired (e.g.
`shell-env`, `shell-exec-formatter`, `git-exec`, `gitlab-pipeline-wait`) and
are inert until a `runners.register()` mounts them.

For exhaustive per-node functional reference (inputs, outputs, config,
examples) see the Starlight docs:
[`apps/docs/src/content/docs/en/nodes/`](/apps/docs/src/content/docs/en/nodes/).

### LLM / Agent

| Runner file | Kind | Role |
|---|---|---|
| `claude-code-invoke.ts` | `claude_code.invoke` | Invoke the Claude Code CLI (`claude -p --output-format stream-json`). Legacy / replay-only — prefer `agent.invoke` for new templates. |
| `codex-invoke.ts` | `codex.invoke` | Invoke the Codex CLI. Legacy / replay-only. |
| `openrouter-invoke.ts` | `openrouter.invoke` | Invoke a model via the OpenRouter HTTP API (key stored encrypted in settings). |
| `agent-invoke.ts` | `agent.invoke` | **Backend-agnostic** agent invocation (added in PR #54). Selects the LLM gateway at runtime via `config.provider` (`claude-code` / `codex` / `openrouter`). This is the recommended way to call LLMs in new templates. |
| `claude-code-judge.ts` | `claude_code.judge` | Claude Code as judge (legacy). |
| `agent-judge.ts` | `agent.judge` | **Backend-agnostic** judge (PR #54). Auto-opens a feedback loop on `rejected`. |
| `llm-judge.ts` | `llm.judge` | LLM-based quality gate: parses a JSON verdict (`approved` / `rejected`), auto-opens feedback loops with bounded retries, and routes to `exhausted` when retries are spent. |

> **No shared LLM sessions** — every step invocation starts from a fresh
> context. Data flows only through artifacts. This is a permanent design
> invariant (`wf-no-llm-session-sharing`), not a limitation to be "fixed".

### Branching

| Runner file | Kind | Role |
|---|---|---|
| `branch-bool.ts` | `branch.bool` | Route to one of N branches based on a Markdown boolean verdict. |
| `branch-json.ts` | `branch.json` | Route based on a JSONPath field value in the input artifact. |
| `branch-match.ts` | `branch.match` | Route based on pattern matching against the input. |

### Loops & iteration

| Runner file | Kind | Role |
|---|---|---|
| `loop-foreach.ts` | `loop.foreach` | Opens an iteration scope over a `List<T>` input; emits per-item artifacts. Polymorphic via `config.itemKind`. |
| `loop-collect.ts` | `loop.collect` | Closes an iteration scope; collects per-iteration outputs back into a `List<T>`. |

Iteration scopes are inferred statically by
[`domain/services/iteration-scopes.ts`](/apps/desktop/electron/main/wf/domain/services/iteration-scopes.ts)
— the orchestrator uses this to manage `IterationStarted` events and skip
propagation.

### Data & transforms

| Runner file | Kind | Role |
|---|---|---|
| `json-transform.ts` | `json.transform` | Transform JSON via JSONPath operations. |
| `transform-run.ts` | `transform.run` | Apply a saved parser (declarative or QuickJS code mode) to an input artifact. Replaces the old "active parser" model. |
| `render-markdown.ts` | `render.markdown` | Render an artifact to its Markdown projection. |
| `concat-markdown.ts` | `concat.markdown` | Concatenate multiple Markdown inputs into one. |
| `select-markdown.ts` | `select.markdown` | Select one Markdown input from several. |
| `markdown-template.ts` | `markdown.template` | Render a Markdown template string with `{{variable}}` placeholders. |
| `file-load-markdown.ts` | `file.load_markdown` | Load a single file from disk as a Markdown artifact. |
| `file-load.ts` | `file.load` | Load a single file as a `String` or `Path` artifact. |
| `files-load.ts` | `files.load` | Load multiple files from disk. |
| `files-load-manifest.ts` | `files.load_manifest` | Load files per a manifest artifact (list of paths). |
| `format-validate.ts` | `format.validate` | Validate an artifact's content against its kind's Zod schema. |

### Sub-workflows & composition

| Runner file | Kind | Role |
|---|---|---|
| `workflow-call.ts` | `workflow.call` | **Approach B** — inline a sub-template by graph flattening (`flattenTemplate` in `domain/services/`). The sub-template's steps are inlined into the parent. |
| `template-invoke.ts` | `template.invoke` | **Approach A** — spawn a child instance and wait for completion (spawn-and-wait model). Shares only the `TemplateVariable` interface contract. |

Both coexist; see
[`domain/services/flatten-template.ts`](/apps/desktop/electron/main/wf/domain/services/flatten-template.ts)
and
[`domain/services/template-invoke.ts`](/apps/desktop/electron/main/wf/domain/services/template-invoke.ts)
for the validation rules.

### Human interaction

| Runner file | Kind | Role |
|---|---|---|
| `user-input.ts` | `user.input` | Promote a seed artifact (provided at launch time) to a typed graph output. |
| `human-gate.ts` | `human.gate` | Pause the instance in `awaitingHuman` state. The user resumes by approving or rejecting, which can open a feedback loop. |

### Skills

| Runner file | Kind | Role |
|---|---|---|
| `skill-loader.ts` | `skill.loader` | Resolve a saved `Skill` (versioned system prompt) and emit it as a Markdown artifact, hydrating `{{variable}}` placeholders from the template's variable values. |

Skills are reusable system prompts consumed by `agent.invoke` / `claude_code.invoke` nodes.

### Shell, Git, CI

| Runner file | Kind | Role |
|---|---|---|
| `shell-exec.ts` | `shell.exec` | Execute a shell command with security guards: locked cwd, filtered env, timeout, bounded output capture, forbidden-pattern checks. |
| `git-clone.ts` | `git.clone` | Clone a GitLab repo with token auth. |
| `git-commit-push.ts` | `git.commit_push` | Commit and push changes. |
| `git-worktree-create.ts` | `git.worktree_create` | Create a git worktree. |
| `git-worktree-remove.ts` | `git.worktree_remove` | Remove a git worktree. |
| `gitlab-files-fetch.ts` | `gitlab.files_fetch` | Fetch files from a GitLab repo. |
| `gitlab-mr-create.ts` | `gitlab.mr_create` | Create a GitLab merge request. |
| `gitlab-mr-merge.ts` | `gitlab.mr_merge` | Merge a GitLab merge request. |

### External integrations & utilities

| Runner file | Kind | Role |
|---|---|---|
| `webhook-call.ts` | `webhook.call` | Call an external webhook URL. |
| `export-run.ts` | `export_run` | Self-introspecting step: produces a `RunExport` bundle (events, runs, artifacts, sessions) for debugging or archival. |
| `workspace-set.ts` | `workspace.set` | Set the run's working directory (side-effect, no artifact produced). |

### Plugin-contributed step kinds

Plugins can contribute their own step kinds via `contributions.stepKinds` in
their manifest. The built-in **linear** plugin (see below) contributes five
step kinds. Plugin step kinds are registered post-boot via
`api.registerStepRunner()` and their `resolveSpec` is available to the
renderer through the `StepKindSuggestionRegistry`.

## Adding a new step kind

1. **Write a `StepRunner`** in
   [`wf/plugins/`](/apps/desktop/electron/main/wf/plugins/) implementing the
   contract from
   [`step-runner.ts`](/apps/desktop/electron/main/wf/application/step-runner.ts):
   - `kind`: the `StepKindId` string.
   - `resolveSpec(ctx)`: returns a `NodeSpec` (input ports, output ports).
   - `run(ctx)`: returns a `StepOutcome`.
   - Colocate a `*.test.ts` — most runner files already have one.
2. **Register it** via `runners.register(...)` in
   [`wf/composition-root.ts`](/apps/desktop/electron/main/wf/composition-root.ts).
3. **Add UI support** (if needed):
   - A config panel under
     [`src/ui/components/templates/step-inspector/config/`](/apps/desktop/src/ui/components/templates/step-inspector/config/)
     (pattern: `<KindName>Config.tsx`).
   - An entry in
     [`src/ui/components/templates/step-kinds.ts`](/apps/desktop/src/ui/components/templates/step-kinds.ts)
     if the node should appear in the template editor palette.
   - An entry in
     [`src/ui/features/templates/studio/runnable-kinds.ts`](/apps/desktop/src/ui/features/templates/studio/runnable-kinds.ts)
     if it should be launchable.
4. **Do not change the domain or orchestrator** — the runner contract is the
   only extension point (`wf-new-stepkind-is-runner`).

## Plugin system

Three faces of the plugin system, each living in a different process layer:

### Main side — [electron/main/plugins/](/apps/desktop/electron/main/plugins/)

| File | Role |
|---|---|
| `manifest.ts` | Zod-validated manifest schema: `id` (slug), `version` (semver), `permissions`, `networkHosts`, `contributions` (stepKinds, artifactSchemas, parsers, routes, nav), `core` flag, `minAppVersion`. |
| `permissions-catalog.ts` | 12 permission IDs: `fs:read`, `fs:write`, `secrets`, `engine:read`, `engine:steps`, `engine:llm`, `network`, `notifications`, `protocol`, `http-server`, `db:read`, `db:write`. 7 are fully implemented; the rest are accepted but unbacked. |
| `api.ts` | The `PluginApi` type contract: `PluginFsApi`, `PluginNetApi`, `PluginSecretsApi`, `PluginEngineApi`, `PluginNotificationsApi`, `PluginIpcHandler`. Exposed to `main.js` at `onload(api)`. |
| `permissions.ts` | `buildPluginApi()` — builds a permission-filtered API. **Hot revocation**: every gated method re-checks the grant at call time, not at construction. FS confined to `pluginDataDir`; network checked against `manifest.networkHosts` per call. |
| `loader.ts` | Discovers plugins on disk, validates manifests, checks grants (builtin = auto-grant, user = consult grant store, no grant = pending), runs `onload(api)`. Post-activation pushes `contributions.artifactSchemas`/`parsers`/`stepKindSuggestions` into engine registries. |
| `registry.ts` | In-memory `Map<id, LoadedPlugin>` with states: `active` / `pending` / `disabled` / `failed`. Tracks `registeredStepKinds`, `ipcHandlers`, `grant`. |
| `grants.ts` | SQLite-backed `plugin_grants` table. Grants are **version-bound** — a new version re-prompts for authorization. Built-in plugins get ephemeral in-memory grants. |
| `secrets-backend.ts` | SQLite-backed encrypted secret storage scoped by `pluginId` (plugins never see each other's keys). |
| `protocol.ts` | `plugin://<id>/<path>` custom protocol: resolves against plugin `rootDir`, path-confined (no `..`), allow-listed extensions. Registered as privileged *before* `app.whenReady()`. |

### Renderer side — [src/plugins/](/apps/desktop/src/plugins/)

Loads `renderer.js` bundles via dynamic `import("plugin://<id>/<renderer>")`,
calls `onload(uiApi)`. Each plugin gets a scoped `UiPluginApi` that forwards
to `workbenchRegistry` + `rendererPluginRegistry`, wrapped in per-plugin
error boundaries. The UI API exposes `registerPage`, `registerSettingsTab`,
`invoke`, `subscribe`, plus a `react` namespace (h, Fragment, createElement,
icons) and `primitives` (host-injected UI components).

### SDK — [packages/plugin-sdk/](/packages/plugin-sdk/) (`@ctxfirst/plugin-sdk`)

MIT-licensed, **type-only** package (tsc emits empty JS shims; runtime values
are injected by the host at `onload(api)`). Entry points: `./main` and
`./renderer`, mirroring the main and renderer API contracts. Lets plugin
authors build proprietary, closed-source plugins without AGPL obligations.

### Built-in plugins — [apps/desktop/plugins-builtin/](/apps/desktop/plugins-builtin/)

| Plugin | Permissions | Core | Contributions |
|---|---|---|---|
| `hello-world` | `engine:steps` | No | `hello.echo` step kind (uppercases Markdown input) + a `Hello` page. |
| `kanban` | `fs:read`, `fs:write` | No | Personal kanban board (state in plugin data dir as JSON). |
| `linear` | `engine:steps` | **Yes** | 5 step kinds: `linear.fetch`, `linear.split`, `linear.set-status`, `linear.comment`, `linear.triage.fetch`; publishes `plugin:linear:Ticket@v1` artifact kind. |

Core plugins (`linear`) **must** activate or boot fails fast — their step
kinds are referenced by built-in seed templates.

## Chat agent ("Pi") — [electron/main/chat/](/apps/desktop/electron/main/chat/)

A hexagonal subsystem independent from the workflow engine. Uses
`@earendil-works/pi-coding-agent` ("Pi") as the agent runtime.

- **Domain**: `ChatSession` (id, title, model, JSONL path, system-prompt
  snapshot, `ChatViewContextSnapshot` for live view context).
- **Persistence**: SQLite stores only session metadata; conversation content
  lives in a JSONL file on disk managed by Pi.
- **Ports**: `AgentSessionGateway` (Pi), `ChatSessionStore` (SQLite),
  `AgentToolProvider` (custom tools exposed to Pi — backed by MCP tools, see
  below).
- **Flow**: `chat:sendMessage` (IPC) → service injects live context → Pi
  streams events → callback → `win.webContents.send("chat:event", ...)` →
  renderer subscribes via `api.chat.onEvent`.
- **System prompt**: editable base prompt (max 8192 chars, stored in settings)
  + hardcoded tools section listing all `ctxfirst_*` MCP tools. See
  [`chat/system-prompt.ts`](/apps/desktop/electron/main/chat/system-prompt.ts).

## MCP server — [electron/main/mcp/](/apps/desktop/electron/main/mcp/)

An in-app MCP server (`@modelcontextprotocol/sdk`) on `127.0.0.1:41234/mcp`
(stateless HTTP). Also invocable **in-process** (no HTTP) via IPC — the chat
agent uses this path for its `customTools`.

Exposed tools (all prefixed `ctxfirst_*`):

| Group | Tools |
|---|---|
| Templates | `ctxfirst_list_templates`, `ctxfirst_get_template`, `ctxfirst_save_template` |
| Node specs | `ctxfirst_list_node_specs`, `ctxfirst_list_step_kind_suggestions` |
| Skills | `ctxfirst_list_skills`, `ctxfirst_get_skill`, `ctxfirst_save_skill` |
| Artifact kinds | `ctxfirst_list_artifact_kinds`, `ctxfirst_get_artifact_kind`, `ctxfirst_save_artifact_kind` |
| Run artifacts | `ctxfirst_get_step_artifact` |

Each tool has a Zod `inputSchema`, a `group`, a `destructive` flag, and a
handler. `createMcpToolProvider(engine)` returns the `AgentToolProvider` used
by the chat agent to invoke these tools in-process.

## Change checklist for this area

- **New step kind**: follow the 4-step guide above. The runner contract is
  the only seam — don't touch the domain or orchestrator.
- **New plugin**: create a folder under `plugins-builtin/` (built-in) or
  `<userData>/plugins/` (user) with `manifest.json`, `main.js`, optional
  `renderer.js`. Validate with the manifest schema. If contributing step
  kinds or artifact schemas, ensure the manifest `contributions` section is
  correct and the `core` flag is set if seed templates depend on it.
- **New MCP tool**: add a `ToolDescriptor` in
  [`mcp/tools.ts`](/apps/desktop/electron/main/mcp/tools.ts), expose it in
  `listMcpTools()`, and wire its handler. The chat agent will pick it up
  automatically as a `customTool`.
- **Testing**: colocate `*.test.ts` with runner files. Plugin step-kind
  runners should test `resolveSpec` and `run` in isolation using a fake `deps`
  object. See existing runner tests for the pattern.
