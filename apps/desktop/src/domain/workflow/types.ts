/** Per-builtin-kind metadata. Forces every kind to declare its UI intent. */
type BuiltinArtifactKindTrait = {
  /**
   * Sélectionnable comme valeur d'un discriminateur scalaire (`outputKind` /
   * `inputKind`) et donc proposé dans les selects builtin du studio/inspector.
   * Les kinds agrégats (`isList`) sont exclus : une liste se modélise par un
   * port `isList` + un kind d'élément scalaire, pas par un kind « liste ».
   */
  selectableAsScalar: boolean;
  /** Kind agrégat (liste d'éléments). */
  isList: boolean;
};

/**
 * Source de vérité unique des kinds livrés avec l'app. Le type
 * {@link BuiltinArtifactKind} en dérive (`keyof`), et toutes les listes UI
 * (selects, palettes) se calculent à partir d'ici — ajouter un kind = ajouter
 * une ligne, et tout `Record<ArtifactKind, …>` casse le build tant qu'il ne le
 * gère pas. Les kinds dynamiques (plugin/user) sont runtime-only et ne peuvent
 * pas vivre ici — ils transitent par {@link kindForArtifactSchema}.
 */
export const BUILTIN_ARTIFACT_KINDS = {
  String: { selectableAsScalar: true, isList: false },
  Number: { selectableAsScalar: true, isList: false },
  Boolean: { selectableAsScalar: true, isList: false },
  Url: { selectableAsScalar: true, isList: false },
  Email: { selectableAsScalar: true, isList: false },
  DateTime: { selectableAsScalar: true, isList: false },
  LinearRef: { selectableAsScalar: true, isList: false },
  Markdown: { selectableAsScalar: true, isList: false },
  Path: { selectableAsScalar: true, isList: false },
  PathList: { selectableAsScalar: false, isList: true },
  MarkdownList: { selectableAsScalar: false, isList: true },
  Json: { selectableAsScalar: true, isList: false },
} as const satisfies Record<string, BuiltinArtifactKindTrait>;

export type BuiltinArtifactKind = keyof typeof BUILTIN_ARTIFACT_KINDS;

/** Kind contributed at runtime — user-defined (UI) or plugin-shipped. */
export type DynamicArtifactKind =
  | `user:${string}@${string}`
  | `plugin:${string}:${string}@${string}`;

export type ArtifactKind = BuiltinArtifactKind | DynamicArtifactKind;

/** Stable `(id, version)` ref to an artifact type — round-trip key for the API. */
export type ArtifactSchemaRefView = { id: string; version: string };

/**
 * Result of validating a literal content against a kind (used to check a
 * variable's default value before launch). `error` carries the engine-side
 * validation message, already serialised to a string.
 */
export type ArtifactValidationResultView =
  | { ok: true }
  | { ok: false; error: string };

/** Origin of an `ArtifactSchemaView`. Drives editability in the UI. */
export type ArtifactSchemaSourceView =
  | { kind: "builtin" }
  | { kind: "plugin"; pluginId: string }
  | { kind: "user" };

/**
 * Renderer-facing view of one artifact type. Mirrors the main-process
 * `ArtifactSchemaRecord` over IPC. Schemas are sent as raw JSON Schema
 * (decoded JSON, no zod on the wire).
 */
export type ArtifactSchemaView = {
  id: string;
  version: string;
  name: string;
  description: string;
  rawSchema: unknown | null;
  simplifiedSchema: unknown;
  sampleRaw: string | null;
  /**
   * Concrete example payload conforming to {@link simplifiedSchema}, surfaced
   * read-only by the `KindPreview` UI. `null` ⇒ no explicit sample stored;
   * the renderer falls back to `deriveKindSample(simplifiedSchema)`.
   */
  sample: unknown | null;
  source: ArtifactSchemaSourceView;
  /**
   * Canonical kind of the super-type, when this schema is a refinement (§2).
   * Used by the picker UI (hierarchical grouping) and by `portAccepts` to
   * walk the covariance chain. `null` for primitive roots and stand-alone
   * records.
   */
  extends: ArtifactKind | null;
  /**
   * SHA-256 of the descriptor's normalised structure (§5). The renderer
   * surfaces it to (a) the refinement resolver consumed by `portAccepts` so
   * content-addressed equality works in the editor's hot validation paths,
   * and (b) the schema editor as a fingerprint shown next to the record name.
   */
  structuralHash: string;
  /**
   * The `{{field}}` Markdown gabarit stored on a `user` kind, surfaced by the
   * schema editor. `null` for builtin/plugin kinds and for user kinds without a
   * template. Cf. `specs/typed-kind-rendered-markdown.md`.
   */
  markdownTemplate: string | null;
};

/**
 * Canonical kind string for an artifact type view — builtins use their bare id,
 * dynamic kinds carry their `(source, id, version)` in the string per
 * {@link DynamicArtifactKind}. Single builder shared by every picker that lists
 * runtime types, so the encoding can never drift between call sites.
 */
export const kindForArtifactSchema = (t: ArtifactSchemaView): ArtifactKind => {
  switch (t.source.kind) {
    case "builtin":
      return t.id as ArtifactKind;
    case "user":
      return `user:${t.id}@${t.version}`;
    case "plugin":
      return `plugin:${t.source.pluginId}:${t.id}@${t.version}`;
  }
};

/** Payload accepted by `saveArtifactSchema`. */
export type SaveArtifactSchemaDraft = {
  id: string;
  version: string;
  name: string;
  description?: string;
  rawSchema?: unknown | null;
  simplifiedSchema: unknown;
  sampleRaw?: string | null;
  /**
   * Optional explicit sample for the kind-picker preview. Omitted leaves the
   * column NULL on disk and lets the renderer auto-derive from
   * `simplifiedSchema`.
   */
  sample?: unknown | null;
  /** Super-type for refinement (§2). `null`/omitted ⇒ no parent. */
  extends?: ArtifactKind | null;
  /**
   * Optional `{{field}}` Markdown gabarit for this kind, projected to Markdown
   * by `render.markdown` / `ArtifactView` (cf.
   * `specs/typed-kind-rendered-markdown.md`). `null`/omitted ⇒ no projection.
   */
  markdownTemplate?: string | null;
};

export type ParserMode = "declarative" | "code";

export type ParserSourceView =
  | { kind: "plugin"; pluginId: string }
  | { kind: "user" };

/**
 * Renderer view of a parser. `body` is opaque (declarative tree or JS source,
 * depending on `mode`); the editor knows how to interpret it.
 */
export type ParserView = {
  id: string;
  version: string;
  forType: ArtifactSchemaRefView;
  mode: ParserMode;
  body: unknown;
  source: ParserSourceView;
  meta: Record<string, unknown>;
};

export type SaveParserDraft = {
  id: string;
  version: string;
  forType: ArtifactSchemaRefView;
  mode: ParserMode;
  body: unknown;
  meta?: Record<string, unknown>;
};

export type ParserRefView = { id: string; version: string };

/**
 * Plugin-contributed step kind exposed as a code-action when the user wires
 * an input matching `inputKind` into a step. Mirrors the manifest's
 * `contributions.stepKinds[i].suggestedFor` shape (cf.
 * `specs/artifact-typing-overhaul.md` §Pilier B).
 */
export type StepKindSuggestionView = {
  stepKindId: string;
  label: string;
  icon?: string;
  pluginId: string;
  inputKind: ArtifactKind;
  role?: string;
};

/** Playground input variants — saved (by ref) or inline (uncommitted body). */
export type RunParserDraft =
  | { kind: "saved"; ref: ParserRefView; raw: unknown }
  | {
      kind: "inline";
      forType: ArtifactSchemaRefView;
      mode: ParserMode;
      body: unknown;
      raw: unknown;
    };

export type RunParserResultView = { ok: true; simplified: unknown };

/**
 * Port kind matcher and node-spec view — re-exported from the shared module
 * so main and renderer share a single source of truth. The shared types use
 * `string` for kind values so the helpers (`portAccepts`, `resolveNodeSpec`)
 * stay decoupled from each side's `ArtifactKind` union.
 */
export type {
  PortKindMatcher,
  PortView,
  NodeSpecView,
  TemplateVariableView,
} from "@shared/wf/types";

export type StepKindId =
  | "user.input"
  | "claude_code.invoke"
  | "codex.invoke"
  | "human.gate"
  | "linear.fetch"
  | "linear.split"
  | "linear.set-status"
  | "workspace.set"
  | "shell.exec"
  | "file.load-markdown"
  | "loop.foreach"
  | "loop.collect"
  | "git.worktree.create"
  | "git.commit_push"
  | "git.worktree.remove"
  | "git.clone"
  | "gitlab.mr.create"
  | "gitlab.mr.merge"
  | "gitlab.files.fetch"
  | "webhook.call"
  | "export_run"
  | "workflow.call"
  | string;

export type StepExecStatus =
  | "pending"
  | "running"
  | "awaitingHuman"
  | "awaitingChild"
  | "validated"
  | "looped"
  | "failed"
  | "skipped";

export type InstanceStatus = "running" | "awaitingHuman" | "completed" | "failed";

export type ReviewAnchorView = {
  startLine: number;
  endLine: number;
};

export type ReviewCommentView = {
  anchor: ReviewAnchorView;
  body: string;
};

export type HumanFeedbackView = {
  summary: string;
  comments: ReadonlyArray<ReviewCommentView>;
};

export type StepExecutionView = {
  id: string;
  stepId: string;
  instanceId: string;
  status: StepExecStatus;
  inputArtifacts: ReadonlyArray<string>;
  outputArtifact?: string;
  runs: ReadonlyArray<string>;
  startedAt?: string;
  /**
   * When the step finished doing real work — set on `awaitingHuman` (so the
   * human wait time is excluded) OR on validation/failure for steps without
   * a gate. Use this for compute-time measurements; `endedAt` is the
   * terminal timestamp and lags behind for gated steps.
   */
  executionEndedAt?: string;
  endedAt?: string;
  humanFeedback?: HumanFeedbackView;
  loopFrom?: string;
  /** Opaque `${loopStepId}:${index}` ; même clé = même itération de boucle. */
  iterationKey?: string;
  error?: string;
};

export type OpenLoopView = {
  id: string;
  fromStepExec: string;
  toStepId: string;
  reason: string;
  author: string;
};

export type InstanceView = {
  id: string;
  templateId: string;
  templateVersion: string;
  status: InstanceStatus;
  seedArtifacts: ReadonlyArray<string>;
  executions: ReadonlyArray<StepExecutionView>;
  createdAt: string;
  openLoops: ReadonlyArray<OpenLoopView>;
};

/**
 * One row of the home "awaiting human" inbox: every step execution currently
 * paused on a human gate, across all instances. UI mirror of
 * `AwaitingHumanRow` from the engine use-case.
 */
export type AwaitingHumanItemView = {
  instanceId: string;
  /** Human-readable label of the instance (today: shortened ID). */
  instanceLabel: string;
  templateId: string;
  templateVersion: string;
  stepExecId: string;
  stepId: string;
  stepName: string;
  actorRole: ActorRole;
  /** Artifact under review (output of the previous step). May be null. */
  outputArtifactId: string | null;
  /** ISO-8601 timestamp of when the step entered `awaitingHuman`. */
  awaitingSince: string;
};

export type InstanceSummaryView = {
  id: string;
  templateId: string;
  templateVersion: string;
  status: InstanceStatus;
  createdAt: string;
  updatedAt: string;
  activeStepId?: string;
  stepCount: number;
  channelId: string;
};

export type ChannelIconImageMimeView = "image/png" | "image/jpeg";

/** Renderer-facing view of one channel. Mirrors the SQLite row. */
export type ChannelView = {
  id: string;
  name: string;
  description: string;
  color: string | null;
  iconImagePath: string | null;
  iconImageMime: ChannelIconImageMimeView | null;
  createdAt: string;
  updatedAt: string;
};

export type ChannelIconImageInputView = {
  mime: ChannelIconImageMimeView;
  bytes: Uint8Array;
};

export type ChannelDraftView = {
  id: string;
  name: string;
  description?: string;
  color?: string | null;
  /**
   * Upload d'image : présent → remplace l'image, `null` explicite → supprime,
   * `undefined` → ne touche pas à l'image existante.
   */
  iconImage?: ChannelIconImageInputView | null;
};

export type MovableEntityKindView =
  | "template"
  | "skill"
  | "artifactSchema"
  | "parser";

export type MoveEntityInputView = {
  kind: MovableEntityKindView;
  ref:
    | { id: string; version: string }
    | { ref: string };
  channelId: string | null;
};

export type WfEvent = {
  type: string;
  eventId: string;
  at: string;
  instanceId?: string;
  [key: string]: unknown;
};

export type LlmSessionPayload =
  | { type: "session-start"; model: string; cwd?: string }
  | { type: "text-delta"; text: string }
  | { type: "tool-use"; toolUseId: string; name: string; input: unknown }
  | {
      type: "tool-result";
      toolUseId: string;
      content: unknown;
      isError: boolean;
    }
  | { type: "thinking"; text: string }
  | {
      type: "assistant-message-end";
      usage?: {
        input: number;
        output: number;
        cacheCreate?: number;
        cacheRead?: number;
      };
    }
  | {
      type: "result";
      tokensIn: number;
      tokensOut: number;
      cacheCreate?: number;
      cacheRead?: number;
      costUsd?: number;
      latencyMs: number;
    };

export type LlmSessionEvent = {
  stepExecId: string;
  seq: number;
  sessionId?: string;
  payload: LlmSessionPayload;
};

export type TemplateStepView = {
  id: string;
  name: string;
  kind: StepKindId;
  actorRole: "PO" | "Developer" | "LLMAgent";
  humanGateRequired: boolean;
  config?: Record<string, unknown>;
  /** Map of output slot name → template variable name (cf. domain `StepDef.writesTo`). */
  writesTo?: Record<string, string>;
  /** Map of input port name → template variable name (cf. domain `StepDef.readsFrom`). */
  readsFrom?: Record<string, string>;
  /** Free-form note attached to this step instance (not to the kind). */
  note?: string;
};

export type TemplateTransitionView = {
  from: string;
  fromPort?: string;
  to: string;
  toPort?: string;
  isLoop: boolean;
  /**
   * Relative order among incoming transitions targeting the same `(to, toPort)`
   * on a port declared `isList: true`. Absent ⇒ tail (sorted by creation index).
   */
  order?: number;
};

export type TemplateView = {
  id: string;
  version: string;
  name: string;
  description: string;
  entryStep: string;
  exitSteps: ReadonlyArray<string>;
  steps: ReadonlyArray<TemplateStepView>;
  transitions: ReadonlyArray<TemplateTransitionView>;
  variables: ReadonlyArray<TemplateVariableDraft>;
  status: "draft" | "published";
};

/**
 * Editor-side mirror of a template variable. Same shape on read and write,
 * so we reuse one type for both the IPC view and the draft consumed by the
 * editor.
 */
export type TemplateVariableDraft = {
  name: string;
  kind: ArtifactKind;
  /**
   * Interface role making the template reusable as a sub-workflow
   * (`sub-template-expand.md` §1):
   *  - `input`    → consumed from the caller (bound via `workflow.call.readsFrom`);
   *  - `output`   → exposed back to the caller (bound via `writesTo`);
   *  - `internal` → private to the template (the default; absent ⇒ internal).
   */
  role?: "input" | "output" | "internal";
  description?: string;
  /**
   * Optional literal materialized at launch and pre-assigned to the variable
   * before any step runs. Validated against `kind` by `start-instance`.
   */
  defaultValue?: string;
};

export type ActorRole = "PO" | "Developer" | "LLMAgent";

export type TemplateStepDraft = {
  id: string;
  name: string;
  kind: StepKindId;
  actorRole: ActorRole;
  config: Record<string, unknown>;
  humanGateRequired: boolean;
  writesTo?: Record<string, string>;
  readsFrom?: Record<string, string>;
  /** Free-form note attached to this step instance (not to the kind). */
  note?: string;
};

export type TemplateTransitionDraft = {
  from: string;
  fromPort?: string;
  to: string;
  toPort?: string;
  isLoop: boolean;
  order?: number;
};

export type TemplateDraft = {
  id: string;
  version: string;
  name: string;
  description: string;
  entryStep: string;
  exitSteps: ReadonlyArray<string>;
  steps: ReadonlyArray<TemplateStepDraft>;
  transitions: ReadonlyArray<TemplateTransitionDraft>;
  variables: ReadonlyArray<TemplateVariableDraft>;
  status: "draft" | "published";
};

export type SkillView = {
  ref: string;
  body: string;
  meta: Record<string, unknown>;
};

export type SkillDraft = {
  ref: string;
  body: string;
  meta: Record<string, unknown>;
};

/**
 * Studio/debug — input passé à `debugStep` pour exécuter une node isolée
 * sans persistance. `step` est un snapshot du draft (jamais sauvegardé),
 * `inputs[]` les valeurs saisies dans le formulaire (un par port renseigné).
 */
export type DebugStepInputView = {
  step: {
    id: string;
    name: string;
    kind: StepKindId;
    actorRole: ActorRole;
    config: Record<string, unknown>;
    humanGateRequired: boolean;
    writesTo?: Record<string, string>;
    readsFrom?: Record<string, string>;
    note?: string;
  };
  inputs: ReadonlyArray<{
    port: string;
    kind: ArtifactKind;
    content: string;
  }>;
};

/**
 * Résultat d'un `debugStep` — aplatit le `StepOutcome` du domaine en gardant
 * ce qui est affichable. Pas d'`artifactId` (rien n'a été persisté).
 */
export type DebugStepResultView =
  | {
      kind: "produced";
      artifacts: ReadonlyArray<{
        port: string;
        kind: ArtifactKind;
        content: string;
        metadata: Record<string, string>;
      }>;
    }
  | { kind: "awaiting-human"; actorRole: string }
  | { kind: "workspace-set"; cwd: string }
  | { kind: "error"; message: string };

export type ArtifactContentView = {
  meta: {
    id: string;
    kind: ArtifactKind;
    hash: string;
    storageRef: string;
    metadata: Record<string, string>;
    createdAt: string;
  };
  content: string;
  /**
   * Human-friendly Markdown projection of the payload, resolved main-side at
   * load time (the projection function can't cross IPC). Present only for kinds
   * that carry an *effective* projection (built-in/plugin `fn`, `user` gabarit,
   * or an embedded `renderedMarkdown`); absent for plain `Markdown`/JSON kinds,
   * which keep their existing rendering. When present, `ArtifactView` renders it
   * as GFM ("Lisible") and keeps the original payload on the "Brut" tab. Cf.
   * `specs/typed-kind-rendered-markdown.md`.
   */
  renderedMarkdown?: string;
};

/** Renderer-facing view of a cron-scheduled workflow trigger. */
export type ScheduleSeedView = { kind: ArtifactKind; content: string };

export type ScheduleLastStatusView = "ok" | "error";

export type ScheduleView = {
  id: string;
  channelId: string | null;
  name: string;
  templateRef: string;
  cron: string;
  timezone?: string;
  seeds: ReadonlyArray<ScheduleSeedView>;
  cwd?: string;
  enabled: boolean;
  lastRunAt?: string;
  lastInstanceId?: string;
  lastStatus?: ScheduleLastStatusView;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  /** Next firing date, ISO; `null` when disabled or cron cannot resolve. */
  nextRunAt: string | null;
};

/** Write-side payload for `saveSchedule`. */
export type ScheduleDraftView = {
  id?: string;
  name: string;
  templateRef: string;
  cron: string;
  timezone?: string;
  seeds: ReadonlyArray<ScheduleSeedView>;
  cwd?: string;
  enabled: boolean;
};
