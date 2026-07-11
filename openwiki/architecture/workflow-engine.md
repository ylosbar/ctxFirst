# The workflow engine (`wf/`)

The workflow engine is the heart of the product. It lives under
[apps/desktop/electron/main/wf/](/apps/desktop/electron/main/wf/) and follows
the same hexagonal shape described in
[electron-and-renderer.md](electron-and-renderer.md). This page synthesizes
[ARCHITECTURE.md §6](/ARCHITECTURE.md) and the much more detailed
[wf/GLOSSARY.md](/apps/desktop/electron/main/wf/GLOSSARY.md) — **read the
glossary** if you need precise field-level semantics; this page is a map, not
a replacement.

## Mental model

```
Template (immutable spec, versioned)
   └─ launched → Instance (= WorkflowId, templateVersion frozen, seedArtifacts, channelId frozen)
                    └─ each node visited → StepExecution (typed inputs → outputs per port)
                          └─ each LLM/tool call → Run (provider, model, tokens, cost, latency)
```

Steps never share a session: data flows only through **artifacts** (resolved
via transitions and variable slots). A transition with `isLoop: true` is
**never** auto-traversed — only a human `open-feedback-loop` action or a
judge rejection can traverse it.

## Domain layer — [wf/domain/](/apps/desktop/electron/main/wf/domain/)

Pure types and rules, no IO. Key files:

| File | Concept |
| --- | --- |
| [domain/ids.ts](/apps/desktop/electron/main/wf/domain/ids.ts) | Branded (phantom-typed) IDs: `TemplateId`, `TemplateVersion`, `StepId`, `StepExecId`, `WorkflowId` (= instance), `ArtifactId`, `ArtifactHash`, `EventId`, `RunId`, `LoopId`, `SkillRef`. |
| [domain/template.ts](/apps/desktop/electron/main/wf/domain/template.ts) | `WorkflowTemplate` (immutable versioned spec), `StepDef` (kind, config, inputKinds, outputKind, writesTo/readsFrom, humanGateRequired), `Transition` (from/to, ports, isLoop, scopeOf), `TemplateVariable`. |
| [domain/instance.ts](/apps/desktop/electron/main/wf/domain/instance.ts) | `WorkflowInstance` (root aggregate; templateVersion frozen at launch), `StepExecution` (inputs, outputs per port, `runs[]`, iterationKey, humanFeedback, loopFrom), statuses. |
| [domain/events.ts](/apps/desktop/electron/main/wf/domain/events.ts) | `DomainEvent` — closed append-only union: `InstanceStarted`, `StepStarted`, `StepProducedArtifact`, `VariableAssigned`, `StepAwaitingHumanGate`, `StepValidated`, `StepFailed`, `StepSkipped`, `LoopOpened`/`LoopClosed`, `IterationStarted`, `WorkspaceChanged`, `InstanceCompleted`. Every event carries an `eventId` for replay dedup. |
| [domain/projection.ts](/apps/desktop/electron/main/wf/domain/projection.ts) | Pure reducer `events → InstanceState` (+ `InstanceSummary`, `IterationRecord`). Tracks open loops, iterations, variables. |
| [domain/artifact.ts](/apps/desktop/electron/main/wf/domain/artifact.ts) | `ArtifactKind` (the type grammar), `Artifact` (metadata only: id, kind, hash, storageRef — content lives elsewhere). |
| [domain/artifact-schema.ts](/apps/desktop/electron/main/wf/domain/artifact-schema.ts) + [artifact-schema-hash.ts](/apps/desktop/electron/main/wf/domain/artifact-schema-hash.ts) | `ArtifactKindDescriptor` (compiled Zod schema, JSON Schema, sample, structural hash), `ArtifactSchemaRef`. The structural hash gives a kind its set-theoretic identity. |
| [domain/parse-artifact.ts](/apps/desktop/electron/main/wf/domain/parse-artifact.ts) + [artifact-serializer.ts](/apps/desktop/electron/main/wf/domain/artifact-serializer.ts) | (De)serialization + payload validation against a kind's schema. |
| [domain/judge-feedback.ts](/apps/desktop/electron/main/wf/domain/judge-feedback.ts) + [feedback.ts](/apps/desktop/electron/main/wf/domain/feedback.ts) | `JudgeOutput`/`JudgeVerdict` (approved\|rejected, summary, line-anchored comments), `ReviewComment`. |
| [domain/skill.ts](/apps/desktop/electron/main/wf/domain/skill.ts) | `Skill` — reusable versioned system prompt (`name@version`). |
| [domain/parser.ts](/apps/desktop/electron/main/wf/domain/parser.ts) | `ParserRecord` — artifact transform, declarative or code mode. |
| [domain/channel.ts](/apps/desktop/electron/main/wf/domain/channel.ts) | `Channel` — multi-tenant partition; `DEFAULT_CHANNEL_ID = "personal"`. |
| [domain/schedule.ts](/apps/desktop/electron/main/wf/domain/schedule.ts) | `WorkflowSchedule` — cron trigger for a template. |
| [domain/BuiltIns/](/apps/desktop/electron/main/wf/domain/BuiltIns/) | One file per built-in artifact kind: String, Number, Boolean, Url, Email, DateTime, LinearRef, Markdown, Json, Path, PathList, MarkdownList, RunExport. |
| [domain/services/](/apps/desktop/electron/main/wf/domain/services/) | Pure composition/iteration rules: `flatten-template` (sub-workflow flattening), `iteration-scopes` (foreach scope inference), `transition-policy`, `template-invoke`, `validate-template-invokes`, `validate-workflow-calls`. |

## Event sourcing & projection

- Every state change is a `DomainEvent`
  ([domain/events.ts](/apps/desktop/electron/main/wf/domain/events.ts)),
  appended to `wf_events` (via the `event-log` port) and published on the
  event bus.
- The application-layer `EngineState` maintains an incremental
  per-instance projection (O(1) update per event), materializing an
  immutable, cached `InstanceState`.
- On boot, replaying the log reconstructs all state. Events are idempotent
  by `eventId`.
- **Anti-drift invariant**: execution state is *only* mutated by emitting a
  `DomainEvent` (append then publish) — a use-case that mutates state
  without one is a violation (`wf-state-mutated-by-events`). The projection
  stays a pure, IO-free function.

## Application layer — [wf/application/](/apps/desktop/electron/main/wf/application/)

- **Ports (outbound)** — [application/ports/outbound/](/apps/desktop/electron/main/wf/application/ports/outbound/):
  one file per interface implemented by adapters — `artifact-schema-registry`,
  `artifact-store`, `channel-context`, `channel-icon-store`,
  `channel-registry`, `clock`, `environment`, `event-bus`, `event-log`,
  `file-system`, `hash`, `id-generator`, `linear-gateway`, `llm-gateway`,
  `llm-session-store`, `logger`, `notifier`, `parser-registry`,
  `parser-runtime`, `path`, `run-log`, `schedule-registry`, `shell-gateway`,
  `skill-registry`, `step-kind-suggestions`, `template-registry`.
- **Use-cases** — [application/use-cases/](/apps/desktop/electron/main/wf/application/use-cases/):
  ~40 factories, colocated with tests, following `make…(deps) => async
  (input) => …`. Mutators emit `DomainEvent`s (append then publish); readers
  read the in-memory projection. Some are idempotent data migrations.
- **Orchestrator** — [application/orchestrator/](/apps/desktop/electron/main/wf/application/orchestrator/):
  the state machine. Subscribes to the event bus, applies each event to
  `EngineState`, and on `StepValidated` computes successors, resolves and
  validates inputs, calls the step runner, translates the `StepOutcome`,
  manages loops, infers foreach iteration scopes, and propagates
  `StepSkipped`. Serialized per instance (a promise chain) —
  [instance-orchestrator.ts](/apps/desktop/electron/main/wf/application/orchestrator/instance-orchestrator.ts).
- **Services** — [application/services/](/apps/desktop/electron/main/wf/application/services/):
  includes the *context-assembler*, which builds `systemPrompt`/`userPrompt`
  + a markdown loop history and computes a correlation hash for the run log.
- **Scheduler** — [application/scheduler/](/apps/desktop/electron/main/wf/application/scheduler/):
  `start()` (catch-up + arms cron jobs via `croner`), `reload()`, `stop()`.
- **Step runner contract** — [application/step-runner.ts](/apps/desktop/electron/main/wf/application/step-runner.ts):
  defines `NodeSpec` (inputs: `PortSpec[]`, outputs: `OutputPort[]`,
  optional passthrough), `RunContext` (resolved inputs, loop history,
  attempt, `workspace.cwd`, injected ports), `StepOutcome` (`produced` \|
  `produced-many` \| `produced-on-port` \| `produced-pending-human` \|
  `awaiting-human` \| `workspace-set`). `resolveSpec(ctx)` lets polymorphic
  runners determine their own output kind at resolution time.

**Anti-drift invariant**: a new step kind is implemented by a runner
respecting this contract; **neither the domain nor the orchestrator changes**
to add a kind (`wf-new-stepkind-is-runner`). See
[../domain/step-kinds-and-plugins.md](../domain/step-kinds-and-plugins.md)
for the full runner catalog and how to add one.

## Adapters — [wf/adapters/](/apps/desktop/electron/main/wf/adapters/)

- **SQLite**: `artifact-store` (metadata + FS-backed content-addressed
  blobs), `artifact-schema-registry`, `event-log`, `event-bus` (in-memory +
  llm-session persistence for replay), `template-registry` (+ seeds),
  `skill-registry` (+ seeds), `parser-registry`, `channel-registry`,
  `schedule-registry`, `run-log`.
- **LLM** — [adapters/llm/](/apps/desktop/electron/main/wf/adapters/llm/):
  `claude-code`, `codex-cli`, `openrouter`, `fake-llm` (tests). All implement
  the streaming `LLMGateway` port.
- **Parser runtime** — [adapters/parser-runtime/](/apps/desktop/electron/main/wf/adapters/parser-runtime/):
  declarative interpreter + QuickJS sandbox ("code" mode), dispatched by
  mode, with an audit trail.
- **Integrations**: Linear (GraphQL), shell (`child_process.spawn`),
  notifier.
- **Native utilities**: clock, id-generator (`crypto.randomUUID`), hash
  (sha256), path, environment, file-system, logger, channel-context
  (in-memory), channel-icon-store (FS), step-kind-suggestions.

## Composition root

[wf/composition-root.ts](/apps/desktop/electron/main/wf/composition-root.ts)
is the single place where every adapter is instantiated and injected into
use-cases and the orchestrator. It is where `application` and `adapters`
meet — the **only** place allowed to do that
(`hex-wiring-composition-root-only`). This file is also the **source of
truth for the step-kind catalog**: every registered runner is
`runners.register(...)`'d here.

## Artifacts & kinds (the type grammar)

The shared grammar
([shared/wf/artifact-kind-grammar.ts](/apps/desktop/shared/wf/artifact-kind-grammar.ts))
distinguishes:

- **Primitives / refinements**: `String` → `Url`, `Email`, `DateTime`,
  `LinearRef`; `Number`; `Boolean`.
- **Envelopes** (format + body): `Markdown`, `Json`, `Path`, `PathList`,
  `MarkdownList`, `RunExport`.
- **Parametric** (synthesized at resolution): `List<T>`, `OneOf<A,B,…>`,
  and sugar `Success<T>`/`Error<E>`. Depth-bounded.
- **Dynamic/extensible**: `user:<id>@<version>` (user-editable types, in
  SQLite) and `plugin:<pluginId>:<id>@<version>` (plugin-contributed,
  read-only).

Port acceptance (`portAccepts`,
[shared/wf/port-accepts.ts](/apps/desktop/shared/wf/port-accepts.ts)) handles
wildcard `*`, refinement (`Url ⊆ String`), covariance (`List<Url> ⊆
List<String>`), widening to `OneOf`, and equality by structural hash. The
`ArtifactSchemaRegistry` is the **single source of truth** for kinds
(built-ins + user + plugin + synthesized), compiling JSON Schema → Zod at
resolution time. Anti-drift invariants: kinds only through the registry
(`wf-kinds-via-registry`), port typing only through `portAccepts`
(`wf-port-typing-via-portaccepts`).

> Legacy note: `MarkdownList`/`PathList` are canonicalized to
> `List<Markdown>`/`List<Path>`; `loop.foreach`/`loop.collect` are generic
> over `List<T>` via `config.itemKind`. Both legacy (`{bodies}`/`{paths}`)
> and canonical (`{items}`) payload shapes are transitionally tolerated.

For the exhaustive per-kind, per-node reference, see the public Starlight
docs under
[apps/docs/src/content/docs/en/type-system/](/apps/docs/src/content/docs/en/type-system/)
and
[apps/docs/src/content/docs/en/nodes/](/apps/docs/src/content/docs/en/nodes/).

## Judge, feedback loops, retries

- `llm.judge` validates a "subject" artifact and routes to `approved` /
  `rejected` / `exhausted` ports. Its output follows `JudgeOutput`
  ([domain/judge-feedback.ts](/apps/desktop/electron/main/wf/domain/judge-feedback.ts)).
- On rejection with retries remaining: the orchestrator emits `LoopOpened`
  (authored by `llm.judge:<stepId>`) toward the upstream node, which
  re-runs. The loop history (verdict + comments) is re-injected as markdown
  into the prompt via the context-assembler.
- On exhausted retries: routes to `exhausted`, typically wired to a
  `human.gate`.
- Retry counts are capped — see [specs/llm-judge-bounded-retries.md](/specs/llm-judge-bounded-retries.md)
  if present, and the domain rule in `judge-feedback.ts`.
- Artifact validation modes: `strict` (throw → `StepFailed`), `log-only`
  (warn, degraded payload), `off`.
- **Anti-drift invariant**: a loop-typed transition is never
  auto-traversed — only a human "open feedback loop" action or a judge
  rejection traverses it (`wf-loop-not-auto-traversed`). Steps never share
  an LLM session across the loop (`wf-no-llm-session-sharing`) — this is a
  **permanent design invariant**, not a temporary limitation.

## Channels (multi-tenancy)

Every entity (templates, skills, artifact kinds, parsers, instances,
schedules) is partitioned by `Channel`. Default channel is `"personal"` and
is non-deletable. An instance freezes its `channelId` at launch — this,
together with `templateVersion`, never changes afterward
(`wf-version-channel-frozen`). Current channel is read via the
`channel-context` port.

## Scheduler

A `WorkflowSchedule` (5-field cron + timezone + frozen seeds) is armed as a
`croner` job by the `SchedulerService`, which also catches up on boot and
triggers `start-instance` on each tick. Executions are audited in the
database.

## Parsers

Transform a raw artifact into a simplified payload before LLM injection.
Two modes: `declarative` (interpreted operations) or `code` (QuickJS
sandbox). Registry and runtime are both ports; user parsers are editable,
plugin parsers are read-only.

## Shared layer — `apps/desktop/shared/wf/`

Pure modules importable from both main and renderer (no native access),
encoding identical typing/rendering logic on both sides:

| Module | Role |
| --- | --- |
| [types.ts](/apps/desktop/shared/wf/types.ts) | `PortKindMatcher`, `PortView`, `OutputPortView`, `NodeSpecView`, `TemplateVariableView` — shared node-spec views. |
| [artifact-kind-grammar.ts](/apps/desktop/shared/wf/artifact-kind-grammar.ts) | Parsing/building parametric kinds (`List<>`, `OneOf<>`, `Success`/`Error`). |
| [port-accepts.ts](/apps/desktop/shared/wf/port-accepts.ts) | `portAccepts()` — port-acceptance rule (see above). |
| [structural-hash.ts](/apps/desktop/shared/wf/structural-hash.ts) | Structural hash of a schema = set-theoretic identity of a kind. |
| [resolve-node-spec.ts](/apps/desktop/shared/wf/resolve-node-spec.ts) | Resolves a `NodeSpec` by kind id (consumes the plugin registry). |
| [render-artifact-markdown.ts](/apps/desktop/shared/wf/render-artifact-markdown.ts) / [display-content.ts](/apps/desktop/shared/wf/display-content.ts) | Markdown rendering/projection of an artifact. |
| [placeholders.ts](/apps/desktop/shared/wf/placeholders.ts) | `{{field}}` substitution for user schemas / skills. |
| [derive-kind-sample.ts](/apps/desktop/shared/wf/derive-kind-sample.ts) / [simplified-schema-to-shape-text.ts](/apps/desktop/shared/wf/simplified-schema-to-shape-text.ts) | Sample & shape description for a schema. |
| [layout.ts](/apps/desktop/shared/wf/layout.ts) | Template-editor layout persistence (positions, viewport). |
| [run-export.ts](/apps/desktop/shared/wf/run-export.ts) / [token-usage.ts](/apps/desktop/shared/wf/token-usage.ts) / [channel-icon-image.ts](/apps/desktop/shared/wf/channel-icon-image.ts) | Run export, token usage aggregation, channel icon image. |
| [agent-backends.ts](/apps/desktop/shared/wf/agent-backends.ts) | Backend-agnostic config for `agent.invoke`/`agent.judge` nodes (added in #54) — abstracts over Claude Code / Codex / OpenRouter backends. |

Most modules are colocated with a `.test.ts`.

## Change checklist for this area

- **New step kind** → write a `StepRunner` in
  [wf/plugins/](/apps/desktop/electron/main/wf/plugins/) implementing the
  contract in `step-runner.ts`, register it in
  `wf/composition-root.ts`, add a UI config panel under
  `src/ui/components/templates/step-inspector/config/` if it needs one. See
  [../domain/step-kinds-and-plugins.md](../domain/step-kinds-and-plugins.md).
- **New artifact kind** → add to `wf/domain/BuiltIns/` (built-in) or via the
  `ArtifactSchemaRegistry` (user/plugin kind) — never a parallel kind table.
- **Anything touching state transitions** → make sure the change goes
  through a `DomainEvent`, not a direct mutation; add/extend a `.test.ts`
  colocated with the changed file (most `wf/domain` and `wf/application`
  files already have one — `vitest run` via `yarn test`).
- **Port change** → one port = one interface = one adapter folder; update
  both the interface in `application/ports/outbound/` and every
  implementation under `adapters/`.
