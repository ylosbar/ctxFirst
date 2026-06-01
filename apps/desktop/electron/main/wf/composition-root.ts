import path from "node:path";
import type Database from "better-sqlite3";
import { createFsArtifactStore } from "./adapters/artifact-store/fs-store";
import { migrateLinearRefShape } from "./adapters/artifact-store/migrate-linearref-shape";
import { migrateLinearTicketToPlugin } from "./adapters/artifact-store/migrate-linearticket-to-plugin";
import { migrateRemovedArtifactKinds } from "./adapters/artifact-store/migrate-removed-kinds";
import { createInMemoryChannelContext } from "./adapters/channel-context/in-memory";
import { createFsChannelIconStore } from "./adapters/channel-icon-store/fs-store";
import {
  createSqliteChannelRegistry,
  seedDefaultChannel,
} from "./adapters/channel-registry/sqlite";
import { createSystemClock } from "./adapters/clock/system-clock";
import { createProcessEnvironment } from "./adapters/environment/process-environment";
import { createInMemoryEventBus } from "./adapters/event-bus/in-memory";
import { createNodeFileSystem } from "./adapters/file-system/node-file-system";
import { createSqliteLlmSessionBus } from "./adapters/event-bus/sqlite-llm-session";
import { createSqliteEventLog } from "./adapters/event-log/sqlite-log";
import { createSqliteLlmSessionStore } from "./adapters/llm-session-store/sqlite-llm-session-store";
import { createNodeHash } from "./adapters/hash/node-hash";
import { createCryptoIdGenerator } from "./adapters/id-generator/crypto-uuid";
import { createLinearGraphqlGateway } from "./adapters/linear/graphql";
import { createClaudeCodeLLMGateway } from "./adapters/llm/claude-code";
import { createCodexCliLLMGateway } from "./adapters/llm/codex-cli";
import { createFakeLLMGateway } from "./adapters/llm/fake-llm";
import { createOpenRouterClient } from "./adapters/llm/openrouter";
import { createConsoleLogger } from "./adapters/logger/console-logger";
import { createConsoleNotifier } from "./adapters/notifier/console-notifier";
import { createNodePath } from "./adapters/path/node-path";
import { createSqliteRunLog } from "./adapters/run-log/sqlite-run-log";
import { createChildProcessShellGateway } from "./adapters/shell/child-process";
import {
  createSqliteSkillRegistry,
  seedBuiltinSkills,
} from "./adapters/skill-registry/sqlite";
import {
  createSqliteTemplateRegistry,
  seedBuiltinTemplates,
} from "./adapters/template-registry/sqlite";
import { createSqliteScheduleRegistry } from "./adapters/schedule-registry/sqlite";
import {
  createSchedulerService,
  type SchedulerService,
} from "./application/scheduler/scheduler-service";
import { makeListSchedules } from "./application/use-cases/list-schedules";
import { makeSaveSchedule } from "./application/use-cases/save-schedule";
import { makeSetScheduleEnabled } from "./application/use-cases/set-schedule-enabled";
import { makeDeleteSchedule } from "./application/use-cases/delete-schedule";
import { BUILTIN_TEMPLATE_SEEDS } from "./adapters/template-registry/seeds";
import { createSqliteArtifactSchemaRegistry } from "./adapters/artifact-schema-registry/sqlite";
import { createSqliteParserRegistry } from "./adapters/parser-registry/sqlite";
import { createInMemoryStepKindSuggestionRegistry } from "./adapters/step-kind-suggestions/in-memory";
import { createDeclarativeParserRuntime } from "./adapters/parser-runtime/declarative";
import { createQuickJsParserRuntime } from "./adapters/parser-runtime/quickjs";
import { createDispatchingParserRuntime } from "./adapters/parser-runtime/dispatcher";
import { createSqliteParserAuditSink } from "./adapters/parser-runtime/sqlite-audit";
import type { ArtifactSchemaRegistry } from "./application/ports/outbound/artifact-schema-registry";
import type { ChannelContext } from "./application/ports/outbound/channel-context";
import type { ChannelIconStore } from "./application/ports/outbound/channel-icon-store";
import type { ChannelRegistry } from "./application/ports/outbound/channel-registry";
import type { ParserRegistry } from "./application/ports/outbound/parser-registry";
import type { ParserRuntime } from "./application/ports/outbound/parser-runtime";
import type { StepKindSuggestionRegistry } from "./application/ports/outbound/step-kind-suggestions";
import { DEFAULT_CHANNEL_ID } from "./domain/channel";
import type { WorkflowTemplate } from "./domain/template";
import type { ValidationMode } from "./application/artifact-io";
import { validateBuiltinSeeds } from "./application/validate-template-ports";
import {
  createEngineState,
  rehydrateFromEventLog,
  type EngineState,
} from "./application/engine-state";
import { createInstanceOrchestrator } from "./application/orchestrator/instance-orchestrator";
import type { EventBus, LlmSessionBus } from "./application/ports/outbound/event-bus";
import type { LLMGateway } from "./application/ports/outbound/llm-gateway";
import {
  createStepRunnerRegistry,
  type StepRunnerRegistry,
} from "./application/step-runner";
import { makeDebugStep } from "./application/use-cases/debug-step";
import { makeDeleteInstance } from "./application/use-cases/delete-instance";
import { makeExportInstance } from "./application/use-cases/export-instance";
import { makeGetInstanceTimeline } from "./application/use-cases/get-instance-timeline";
import { makeGetRunTokenUsage } from "./application/use-cases/get-run-token-usage";
import { makeGetTemplate } from "./application/use-cases/get-template";
import { makeListAwaitingHuman } from "./application/use-cases/list-awaiting-human";
import { makeListInstances } from "./application/use-cases/list-instances";
import { makeSearchInstances } from "./application/use-cases/search-instances";
import { makeDeleteSkill } from "./application/use-cases/delete-skill";
import { makeGetSkill } from "./application/use-cases/get-skill";
import { makeListSkills } from "./application/use-cases/list-skills";
import { makeSaveSkill } from "./application/use-cases/save-skill";
import { makeListNodeSpecs } from "./application/use-cases/list-node-specs";
import { makeListTemplates } from "./application/use-cases/list-templates";
import { makeOpenFeedbackLoop } from "./application/use-cases/open-feedback-loop";
import { makeRenameTemplate } from "./application/use-cases/rename-template";
import { makeSaveTemplate } from "./application/use-cases/save-template";
import { makeGetTemplateLayout } from "./application/use-cases/get-template-layout";
import { makeSaveTemplateLayout } from "./application/use-cases/save-template-layout";
import { makeStartInstance } from "./application/use-cases/start-instance";
import { makeSubmitHumanDecision } from "./application/use-cases/submit-human-decision";
import { makeListArtifactSchemas } from "./application/use-cases/list-artifact-schemas";
import { makeSaveArtifactSchema } from "./application/use-cases/save-artifact-schema";
import { makeDeleteArtifactSchema } from "./application/use-cases/delete-artifact-schema";
import { makeListParsers } from "./application/use-cases/list-parsers";
import { makeSaveParser } from "./application/use-cases/save-parser";
import { makeDeleteParser } from "./application/use-cases/delete-parser";
import { makeRunParser } from "./application/use-cases/run-parser";
import { makeListStepKindSuggestions } from "./application/use-cases/list-step-kind-suggestions";
import { makeListChannels } from "./application/use-cases/list-channels";
import { makeSaveChannel } from "./application/use-cases/save-channel";
import { makeDeleteChannel } from "./application/use-cases/delete-channel";
import { makeMoveEntity } from "./application/use-cases/move-entity";
import { createConcatMarkdownRunner } from "./plugins/concat-markdown";
import { createFileLoadMarkdownRunner } from "./plugins/file-load-markdown";
import { createHumanGateRunner } from "./plugins/human-gate";
import { createBranchBoolRunner } from "./plugins/branch-bool";
import { createBranchMatchRunner } from "./plugins/branch-match";
import { createClaudeCodeInvokeRunner } from "./plugins/claude-code-invoke";
import { createCodexInvokeRunner } from "./plugins/codex-invoke";
import { createLlmJudgeRunner } from "./plugins/llm-judge";
import { createFormatValidateRunner } from "./plugins/format-validate";
import { createOpenRouterInvokeRunner } from "./plugins/openrouter-invoke";
import { createExportRunRunner } from "./plugins/export-run";
import { createGitCloneRunner } from "./plugins/git-clone";
import { createGitlabMrCreateRunner } from "./plugins/gitlab-mr-create";
import { createGitlabMrMergeRunner } from "./plugins/gitlab-mr-merge";
import { createGitCommitPushRunner } from "./plugins/git-commit-push";
import { createGitWorktreeCreateRunner } from "./plugins/git-worktree-create";
import { createGitWorktreeRemoveRunner } from "./plugins/git-worktree-remove";
import { createLoopCollectRunner } from "./plugins/loop-collect";
import { createLoopForeachRunner } from "./plugins/loop-foreach";
import { createShellExecRunner } from "./plugins/shell-exec";
import { createSkillLoaderRunner } from "./plugins/skill-loader";
import { createUserInputRunner } from "./plugins/user-input";
import { createJsonTransformRunner } from "./plugins/json-transform";
import { createRenderMarkdownRunner } from "./plugins/render-markdown";
import { createTransformRunRunner } from "./plugins/transform-run";
import { createWebhookCallRunner } from "./plugins/webhook-call";
import { createWorkspaceSetRunner } from "./plugins/workspace-set";
import { createWorkflowCallRunner } from "./plugins/workflow-call";
import { attachBusLogger } from "./logging";

// Composition root du module `wf` : seul endroit où les adapters concrets
// sont instanciés et injectés dans les use-cases applicatifs. Le reste du
// code ne dépend que des ports (interfaces) — voir ARCHITECTURE.md.
//
// Surface publique exposée au process main (handlers IPC). Tout ce qui
// transite vers le renderer passe par les use-cases ou par les bus
// (bus = événements de domaine, llmSession = events typés de session LLM).
export type WfEngine = {
  startInstance: ReturnType<typeof makeStartInstance>;
  submitHumanDecision: ReturnType<typeof makeSubmitHumanDecision>;
  openFeedbackLoop: ReturnType<typeof makeOpenFeedbackLoop>;
  getInstanceTimeline: ReturnType<typeof makeGetInstanceTimeline>;
  getRunTokenUsage: ReturnType<typeof makeGetRunTokenUsage>;
  /**
   * Assembles the full self-contained {@link RunExportBundle} for an instance.
   * Same use-case that backs the `export_run` step, exposed here so the IPC
   * bridge can drive an out-of-band export (toolbar/context-menu) without the
   * template having to include the step.
   */
  exportInstance: ReturnType<typeof makeExportInstance>;
  getTemplate: ReturnType<typeof makeGetTemplate>;
  listTemplates: ReturnType<typeof makeListTemplates>;
  listNodeSpecs: ReturnType<typeof makeListNodeSpecs>;
  saveTemplate: ReturnType<typeof makeSaveTemplate>;
  renameTemplate: ReturnType<typeof makeRenameTemplate>;
  getTemplateLayout: ReturnType<typeof makeGetTemplateLayout>;
  saveTemplateLayout: ReturnType<typeof makeSaveTemplateLayout>;
  listSkills: ReturnType<typeof makeListSkills>;
  getSkill: ReturnType<typeof makeGetSkill>;
  saveSkill: ReturnType<typeof makeSaveSkill>;
  deleteSkill: ReturnType<typeof makeDeleteSkill>;
  listInstances: ReturnType<typeof makeListInstances>;
  listAwaitingHuman: ReturnType<typeof makeListAwaitingHuman>;
  searchInstances: ReturnType<typeof makeSearchInstances>;
  deleteInstance: ReturnType<typeof makeDeleteInstance>;
  listArtifactSchemas: ReturnType<typeof makeListArtifactSchemas>;
  saveArtifactSchema: ReturnType<typeof makeSaveArtifactSchema>;
  deleteArtifactSchema: ReturnType<typeof makeDeleteArtifactSchema>;
  listParsers: ReturnType<typeof makeListParsers>;
  saveParser: ReturnType<typeof makeSaveParser>;
  deleteParser: ReturnType<typeof makeDeleteParser>;
  runParser: ReturnType<typeof makeRunParser>;
  listStepKindSuggestions: ReturnType<typeof makeListStepKindSuggestions>;
  listChannels: ReturnType<typeof makeListChannels>;
  saveChannel: ReturnType<typeof makeSaveChannel>;
  deleteChannel: ReturnType<typeof makeDeleteChannel>;
  moveEntity: ReturnType<typeof makeMoveEntity>;
  /** Studio/debug — exécute une node isolée sans persistance. */
  debugStep: ReturnType<typeof makeDebugStep>;
  /** Mutable holder of the currently-active channel. Exposed for the IPC bridge. */
  channels: ChannelContext;
  /** Read access to the channels table. Exposed for the IPC bridge. */
  channelRegistry: ChannelRegistry;
  /** Disk-backed icon image store. Exposed so the IPC bridge can stream bytes. */
  channelIcons: ChannelIconStore;
  bus: EventBus;
  llmSession: LlmSessionBus;
  state: EngineState;
  artifactStore: ReturnType<typeof createFsArtifactStore>;
  /**
   * Step runner registry. Exposed so the plugin loader (running after the
   * engine boot) can contribute additional step kinds via
   * `api.registerStepRunner`. New runners are picked up lazily by the
   * orchestrator at `resolve(kind)` time, so post-boot registration is safe.
   */
  runners: StepRunnerRegistry;
  /**
   * Dynamic artifact-schema registry. Exposed so the plugin loader can push
   * `contributions.artifactSchemas` from manifests; the IPC layer also uses it
   * to back the UI for user-defined types (Phase 2).
   */
  artifactSchemas: ArtifactSchemaRegistry;
  /**
   * Parser registry. Same exposure rationale as `artifactSchemas`. Consumed
   * by the `transform.run` step runner to resolve a saved parser by ref.
   */
  parsers: ParserRegistry;
  /**
   * Parser runtime. Phase 1 ships the declarative adapter; mode `"code"` runs
   * in the QuickJS sandbox (Phase 3). Consumed by the `transform.run` step
   * runner to apply a saved parser to its input.
   */
  parserRuntime: ParserRuntime;
  /**
   * Snapshot of plugin-contributed step-kind suggestions (`suggestedFor`).
   * Exposed so the plugin loader can push contributions and the IPC bridge
   * can serve the template editor's code-actions.
   */
  stepKindSuggestions: StepKindSuggestionRegistry;
  /**
   * Validates every built-in seed template against the current runner
   * registry. Must be called by the composition root *after* plugins have
   * loaded — built-in seeds are allowed to reference plugin-contributed step
   * kinds, so running this inside `buildWfEngine` (before plugin load) would
   * spuriously fail. Throws on the first port-typing mismatch.
   */
  validateSeeds: () => void;
  /**
   * Cron scheduler driving `wf_schedules`. The composition root builds it but
   * does NOT call `start()` — that's deferred to `index.ts` after plugins have
   * loaded, exactly like `validateSeeds`, so a schedule's pinned template can
   * reference plugin-contributed step kinds.
   */
  scheduler: SchedulerService;
  listSchedules: ReturnType<typeof makeListSchedules>;
  saveSchedule: ReturnType<typeof makeSaveSchedule>;
  setScheduleEnabled: ReturnType<typeof makeSetScheduleEnabled>;
  deleteSchedule: ReturnType<typeof makeDeleteSchedule>;
  stop: () => void;
};

type BuildOptions = {
  db: Database.Database;
  artifactsDir: string;
  /** Root directory for uploaded channel icon images (`userData/channel-icons`). */
  channelIconsDir: string;
  llm?: LLMGateway;
  /**
   * Optional Codex gateway override. Defaults to the real `codex exec` CLI
   * adapter; tests inject a fake to exercise `codex.invoke` without a binary.
   */
  codex?: LLMGateway;
  /**
   * Resolves the Linear API key at call time. Wired by the bootstrap to
   * read from the user's settings store; the engine itself stays ignorant
   * of how/where the key is persisted.
   */
  getLinearApiKey?: () => string | null | undefined;
  /**
   * Resolves the OpenRouter API key at call time. Same rationale as
   * `getLinearApiKey`. Consumed by the `openrouter.invoke` step runner and
   * (eventually) the Pi-driven chat session gateway.
   */
  getOpenRouterApiKey?: () => string | null | undefined;
  /**
   * Resolves the OpenRouter default model selected by the user. Used by
   * `openrouter.invoke` when the step config doesn't override it.
   */
  getOpenRouterDefaultModel?: () => string;
  /**
   * Resolves the GitLab access token at call time; wired by the bootstrap to
   * the settings store (encrypted via `safeStorage`). Consumed by the
   * `git.clone` step runner — same rationale as `getLinearApiKey`.
   */
  getGitLabAccessToken?: () => string | null | undefined;
  /**
   * Managed root directory for `git.clone` checkouts (e.g.
   * `userData/clones`). Used as the default `baseDir` when a `git.clone` step
   * leaves it blank; the bootstrap guarantees the directory exists on disk.
   */
  clonesDir?: string;
  /**
   * Validation mode applied when parsing artifact payloads. Resolved once
   * by the bootstrap (typically from `WF_ARTIFACT_VALIDATION`) and threaded
   * through; the engine itself never reads the environment.
   */
  artifactValidationMode?: ValidationMode;
  /**
   * Resolves the host app version at call time — stamped into
   * `RunExportBundle.exportedBy.appVersion` by the `export_run` step.
   * Bootstrap wires this to `electron.app.getVersion()`; tests can stub it.
   */
  getAppVersion?: () => string | undefined;
  /**
   * Hydrates / persists the currently-active channel. Wired to
   * `SettingsStore.{get,set}ActiveChannelId` by the bootstrap.
   */
  channelSettings?: {
    read: () => string | null;
    write: (id: string) => void;
  };
};

export const buildWfEngine = async ({
  db,
  artifactsDir,
  channelIconsDir,
  llm,
  codex,
  getLinearApiKey,
  getOpenRouterApiKey,
  getOpenRouterDefaultModel,
  getGitLabAccessToken,
  clonesDir,
  artifactValidationMode,
  getAppVersion,
  channelSettings,
}: BuildOptions): Promise<WfEngine> => {
  // --- Adapters infra (ports sortants) ---
  // Les primitives (clock, ids) sont injectées partout pour rester
  // déterministes en test. Le bus reste in-memory : le module ne traverse
  // pas la frontière process, le renderer s'abonne via IPC plus haut.
  const clock = createSystemClock();
  const ids = createCryptoIdGenerator();
  const logger = createConsoleLogger();
  const hash = createNodeHash();
  const pathPort = createNodePath();
  const environment = createProcessEnvironment();
  const fileSystem = createNodeFileSystem();
  const validationMode: ValidationMode = artifactValidationMode ?? "strict";
  const bus = createInMemoryEventBus();
  const llmSession = createSqliteLlmSessionBus({ db });
  // Persistance : event log = source de vérité (event sourcing),
  // run log = trace d'exécution debug, artifactStore = blobs hors SQLite.
  const log = createSqliteEventLog({ db });
  const runLog = createSqliteRunLog({ db });
  const llmSessionStore = createSqliteLlmSessionStore({ db });
  // One-shot cleanup of on-disk artifact meta/bin files whose `kind` was
  // removed (TechSpec/CodePatch/QuestionList/Keyword → Markdown). Runs once,
  // gated by a row in `app_settings`; pairs with the SQLite migration that
  // rewrites references inside event payloads and template/skill columns.
  await migrateRemovedArtifactKinds(artifactsDir, db);
  // §2 — rewrite legacy `LinearRef` payloads from `{ ref }` to the unified
  // `{ value }` shape that the refinement schema validates against.
  // Idempotent via its own `app_settings` key.
  await migrateLinearRefShape(artifactsDir, db);
  // §3 — rewrite legacy `LinearTicket` artifact metadata to the plugin-scoped
  // kind `plugin:linear:Ticket@v1`. Payload bytes are unchanged.
  await migrateLinearTicketToPlugin(artifactsDir, db);
  // --- Channels ---
  // The active channel is a runtime-mutable cell hydrated from the user's
  // settings; every scopable adapter pulls the current id from it on read,
  // so the rest of the engine stays oblivious. A missing setting (clean
  // install) or a stale id falls back to the default seed.
  const channelRegistry = createSqliteChannelRegistry({ db });
  const channelIcons = createFsChannelIconStore({ rootDir: channelIconsDir });
  // The default channel is the FK anchor for every seeded built-in row.
  // Re-seed it defensively in case it was wiped (dev `wipe-db` script,
  // accidental DELETE) — migration v12 only runs once.
  seedDefaultChannel(db);
  const initialChannel = channelSettings?.read() ?? DEFAULT_CHANNEL_ID;
  const channels = createInMemoryChannelContext({
    initial: initialChannel,
    onPersist: (id) => channelSettings?.write(id),
  });

  // Seed des skills/templates builtins avant ouverture du registre, pour
  // garantir leur présence dès le premier accès en lecture.
  seedBuiltinSkills(db);
  const skills = createSqliteSkillRegistry({ db, channels });
  seedBuiltinTemplates(db);
  const templates = createSqliteTemplateRegistry({ db, channels });
  const scheduleRegistry = createSqliteScheduleRegistry({ db, channels });
  // --- Dynamic artifact types & parsers ---
  // Both registries are constructed empty of plugin contributions; the
  // plugin loader pushes its manifest-declared types/parsers via
  // `setPluginContributions(...)` after `buildWfEngine` returns. Until then,
  // only built-ins and user-defined rows from SQLite are visible.
  //
  // `artifactSchemas` is built **before** `artifactStore` because the store
  // validates payloads against the registry on every `put`. Plugin
  // contributions are pushed in later by the loader; until then validation
  // only knows about built-ins and user-defined rows, which matches the
  // visibility of `parseArtifact`.
  const artifactSchemas = createSqliteArtifactSchemaRegistry({ db, channels });
  const artifactStore = createFsArtifactStore({
    rootDir: path.join(artifactsDir),
    clock,
    ids,
    artifactSchemas,
  });
  const parsers = createSqliteParserRegistry({ db, channels });
  const stepKindSuggestions = createInMemoryStepKindSuggestionRegistry();
  // Two backends behind one dispatching runtime — declarative (Phase 1, pure
  // interpretation) and code (Phase 3, QuickJS sandbox + audit log). The
  // dispatcher routes on `parser.mode` so the orchestrator stays oblivious.
  const parserAudit = createSqliteParserAuditSink({ db });
  const parserRuntime = createDispatchingParserRuntime({
    declarative: createDeclarativeParserRuntime(),
    code: createQuickJsParserRuntime({ audit: parserAudit }),
  });
  // §0 — the registry is the single dispatch path; the orchestrator and
  // adapters receive it explicitly via deps. The legacy `dynamicSchemaResolver`
  // singleton has been removed.
  const notifier = createConsoleNotifier();
  // LLM injectable : permet de substituer un fake en test sans toucher
  // au câblage. Par défaut, on appelle Claude Code en CLI.
  const llmGateway = llm ?? createClaudeCodeLLMGateway();
  // Codex : adapter `codex exec` CLI, même contrat que Claude. Injectable en
  // test via le param `codex` du builder.
  const codexGateway = codex ?? createCodexCliLLMGateway();
  // Linear : adapter HTTP/GraphQL. La clé est résolue à chaque appel via
  // le callback (settings store côté bootstrap), avec fallback sur
  // LINEAR_API_KEY. L'absence de clé n'empêche pas le boot — seul le step
  // `linear.fetch` échouera explicitement à l'exécution.
  const linearGateway = createLinearGraphqlGateway({
    getApiKey: getLinearApiKey,
  });
  // Shell : adapter `child_process.spawn`. La sécurité (cwd verrouillé,
  // env filtré, timeout) est portée par le runner `shell.exec` — le
  // gateway se contente d'exécuter la requête déjà vérifiée.
  const shellGateway = createChildProcessShellGateway();
  // OpenRouter : adapter HTTP, single-shot. Credentials résolus à chaque
  // appel (la clé peut être modifiée en Settings sans relancer l'engine).
  const openRouterClient = createOpenRouterClient({
    getApiKey: async () => getOpenRouterApiKey?.() ?? null,
  });
  const resolveOpenRouterDefaultModel = async (): Promise<string> =>
    getOpenRouterDefaultModel?.() ?? "openai/gpt-4o-mini";

  // --- Step runners (plugins) ---
  // Chaque type d'étape de workflow a son runner ; l'orchestrateur les
  // dispatch via la registry plutôt qu'avec un switch en dur.
  const runners = createStepRunnerRegistry();
  // Synchronous snapshot of templates by `id@version`, consumed by the
  // `workflow.call` runner's (pure, sync) `resolveSpec` to derive its ports
  // from the sub-template's interface variables. Warmed from the registry and
  // refreshed opportunistically; a miss degrades to an empty signature.
  const templateSnapshot = new Map<string, WorkflowTemplate>();
  const warmTemplateSnapshot = (): void => {
    void templates
      .list()
      .then((all) => {
        for (const t of all) templateSnapshot.set(`${t.id}@${t.version}`, t);
      })
      .catch(() => undefined);
  };
  warmTemplateSnapshot();
  runners.register(
    createWorkflowCallRunner({
      getChild: (ref) => {
        const hit = templateSnapshot.get(`${ref.templateId}@${ref.templateVersion}`);
        if (!hit) warmTemplateSnapshot();
        return hit;
      },
    }),
  );
  runners.register(createUserInputRunner());
  runners.register(createHumanGateRunner());
  runners.register(createClaudeCodeInvokeRunner());
  runners.register(createCodexInvokeRunner({ codex: codexGateway }));
  runners.register(createLlmJudgeRunner());
  runners.register(createFormatValidateRunner());
  runners.register(
    createOpenRouterInvokeRunner({
      openrouter: openRouterClient,
      getDefaultModel: resolveOpenRouterDefaultModel,
    }),
  );
  // `linear.fetch` and `linear.split` ship as the `plugins-builtin/linear`
  // core plugin (cf. specs/artifact-type-system-refonte.md §3). The plugin
  // loader registers them at boot through `api.registerStepRunner` — they
  // access the engine's Linear gateway and artifact store through `ctx.deps`,
  // so no host-level wiring is needed beyond the existing orchestrator.
  runners.register(createBranchBoolRunner());
  runners.register(createBranchMatchRunner());
  runners.register(createWorkspaceSetRunner());
  runners.register(createShellExecRunner());
  runners.register(createGitWorktreeCreateRunner());
  runners.register(createGitCommitPushRunner());
  runners.register(createGitWorktreeRemoveRunner());
  runners.register(
    createGitCloneRunner({
      getAccessToken: getGitLabAccessToken,
      defaultBaseDir: clonesDir,
    }),
  );
  runners.register(
    createGitlabMrCreateRunner({ getAccessToken: getGitLabAccessToken }),
  );
  runners.register(
    createGitlabMrMergeRunner({ getAccessToken: getGitLabAccessToken }),
  );
  runners.register(createConcatMarkdownRunner());
  runners.register(createTransformRunRunner());
  runners.register(createJsonTransformRunner());
  runners.register(createRenderMarkdownRunner());
  runners.register(createWebhookCallRunner());
  runners.register(createFileLoadMarkdownRunner());
  runners.register(createSkillLoaderRunner());
  runners.register(createLoopForeachRunner());
  runners.register(createLoopCollectRunner());

  // `export_run` is a self-introspecting step that needs read access to the
  // event log, run log, template registry and LLM session store — none of
  // which are part of `RunContext.deps` (and shouldn't be, they would leak
  // unrelated capabilities into every other runner). We close those deps
  // into a dedicated use-case here and inject the use-case into the runner.
  const exportInstance = makeExportInstance(
    {
      eventLog: log,
      runLog,
      artifactStore,
      llmSessions: llmSessionStore,
      templates,
      clock,
    },
    getAppVersion ?? (() => undefined),
  );
  runners.register(createExportRunRunner(exportInstance));

  // Seed validation is *not* run here — it would fail for any built-in seed
  // that references a plugin-contributed step kind, because plugins are
  // loaded after `buildWfEngine` returns. The composition root calls
  // `engine.validateSeeds()` once plugins are in.

  // --- État en mémoire reconstruit depuis l'event log ---
  // L'état dérive intégralement des événements : on l'abonne au bus
  // d'abord, puis on rejoue tout l'historique pour le ramener à jour
  // avant de démarrer l'orchestrateur (sinon les premières décisions
  // se prendraient sur un état vide).
  const state = createEngineState();
  bus.subscribe((evt) => state.apply(evt));
  attachBusLogger(bus, llmSession);
  await rehydrateFromEventLog(state, log);
  logger.info(`[wf:boot] engine built · instances=${state.listInstanceIds().length}`);

  // --- Orchestrateur ---
  // Boucle de travail du moteur : observe le bus, fait avancer chaque
  // instance étape par étape via les runners. Démarré une fois l'état
  // réhydraté pour éviter de réagir à des événements rejoués.
  const orchestrator = createInstanceOrchestrator({
    bus,
    log,
    clock,
    ids,
    state,
    templates,
    runners,
    artifactStore,
    artifactSchemas,
    llm: llmGateway,
    linear: linearGateway,
    shell: shellGateway,
    runLog,
    notifier,
    llmSession,
    logger,
    hash,
    path: pathPort,
    environment,
    fs: fileSystem,
    validationMode,
    parsers,
    parserRuntime,
    skills,
  });
  orchestrator.start();

  // --- Use-cases applicatifs exposés au main process ---
  // Chaque use-case reçoit uniquement les ports dont il a besoin (pas
  // l'engine entier) pour rester testable et explicite sur ses deps.
  //
  // `startInstance` est extrait pour être partagé entre l'objet retourné
  // (handler IPC manuel) et le scheduler (déclenchement cron en fond).
  const startInstance = makeStartInstance({ templates, artifactStore, bus, log, clock, ids, channels });
  const scheduler = createSchedulerService({
    registry: scheduleRegistry,
    startInstance,
    clock,
    logger,
  });
  return {
    startInstance,
    submitHumanDecision: makeSubmitHumanDecision({ bus, log, clock, ids }),
    openFeedbackLoop: makeOpenFeedbackLoop({ bus, log, clock, ids, templates, state }),
    getInstanceTimeline: makeGetInstanceTimeline({ state }),
    getRunTokenUsage: makeGetRunTokenUsage({ state, runLog }),
    // Reuse the same use-case instance already injected into the `export_run`
    // runner above — no need to rebuild its dependency closure.
    exportInstance,
    getTemplate: makeGetTemplate({ templates }),
    listTemplates: makeListTemplates({ templates }),
    listNodeSpecs: makeListNodeSpecs({ runners }),
    saveTemplate: makeSaveTemplate({ templates, runners, artifactSchemas }),
    renameTemplate: makeRenameTemplate({ templates }),
    getTemplateLayout: makeGetTemplateLayout({ templates }),
    saveTemplateLayout: makeSaveTemplateLayout({ templates }),
    listSkills: makeListSkills({ skills }),
    getSkill: makeGetSkill({ skills }),
    saveSkill: makeSaveSkill({ skills }),
    deleteSkill: makeDeleteSkill({ skills }),
    listInstances: makeListInstances({ state, channels }),
    listAwaitingHuman: makeListAwaitingHuman({ state, templates, channels }),
    searchInstances: makeSearchInstances({ state, log, channels }),
    deleteInstance: makeDeleteInstance({ log, state }),
    listArtifactSchemas: makeListArtifactSchemas({ artifactSchemas }),
    saveArtifactSchema: makeSaveArtifactSchema({ artifactSchemas }),
    deleteArtifactSchema: makeDeleteArtifactSchema({ artifactSchemas }),
    listParsers: makeListParsers({ parsers }),
    saveParser: makeSaveParser({ parsers }),
    deleteParser: makeDeleteParser({ parsers }),
    runParser: makeRunParser({ parsers, parserRuntime }),
    listStepKindSuggestions: makeListStepKindSuggestions({
      stepKindSuggestions,
    }),
    listChannels: makeListChannels({ channels: channelRegistry }),
    saveChannel: makeSaveChannel({ channels: channelRegistry, channelIcons }),
    deleteChannel: makeDeleteChannel({
      channels: channelRegistry,
      channelContext: channels,
      channelIcons,
    }),
    moveEntity: makeMoveEntity({ db }),
    debugStep: makeDebugStep({
      runners,
      parsers,
      parserRuntime,
      skills,
      artifactSchemas,
      llm: llmGateway,
      linear: linearGateway,
      shell: shellGateway,
      clock,
      ids,
      logger,
      hash,
      path: pathPort,
      environment,
      fs: fileSystem,
    }),
    channels,
    channelRegistry,
    channelIcons,
    bus,
    llmSession,
    state,
    artifactStore,
    runners,
    artifactSchemas,
    parsers,
    parserRuntime,
    stepKindSuggestions,
    validateSeeds: () =>
      validateBuiltinSeeds(BUILTIN_TEMPLATE_SEEDS, runners, artifactSchemas),
    scheduler,
    listSchedules: makeListSchedules({ registry: scheduleRegistry }),
    saveSchedule: makeSaveSchedule({ registry: scheduleRegistry, scheduler }),
    setScheduleEnabled: makeSetScheduleEnabled({
      registry: scheduleRegistry,
      scheduler,
    }),
    deleteSchedule: makeDeleteSchedule({
      registry: scheduleRegistry,
      scheduler,
    }),
    stop: () => {
      scheduler.stop();
      orchestrator.stop();
    },
  };
};

export { createFakeLLMGateway };
