/**
 * A {@link WorkflowInstance} is a single execution of a
 * {@link WorkflowTemplate} for a concrete input. Its state is *derived* from
 * the immutable event log — see `projection.ts`.
 */
import type { ReviewComment } from "./feedback";
import type {
  ArtifactId,
  RunId,
  StepExecId,
  StepId,
  TemplateId,
  TemplateVersion,
  WorkflowId,
} from "./ids";
import type { WorkflowTemplate } from "./template";

/**
 * Lifecycle state of a single {@link StepExecution}.
 *
 * - `pending`       → orchestrator has not started it yet.
 * - `running`       → runner is executing.
 * - `awaitingHuman` → paused on a `human.gate`; waiting for a decision.
 * - `awaitingChild` → paused on a `template.invoke`; waiting for a spawned child
 *                     instance to reach a terminal state. Mirrors `awaitingHuman`
 *                     in every status-decision site (blocked, not terminal). The
 *                     runner/orchestrator that produces it lands in Phase B
 *                     (`sub-template-invoke.md` §3); in Phase A the status exists
 *                     so the projection and UI can represent it, but nothing emits
 *                     the `ChildInstanceSpawned` event that triggers it yet.
 * - `validated`     → finished successfully and approved (by human or auto).
 * - `looped`        → invalidated by a {@link FeedbackLoop}; its output
 *                     remains accessible for diff viewers.
 * - `failed`        → the runner threw.
 * - `skipped`       → never ran because a mutually-exclusive upstream branch
 *                     chose a different port. Terminal (cf. `StepSkipped` in
 *                     `events.ts`).
 */
export type StepExecStatus =
  | "pending"
  | "running"
  | "awaitingHuman"
  | "awaitingChild"
  | "validated"
  | "looped"
  | "failed"
  | "skipped";

/**
 * One execution of one step within an instance. A single {@link StepId} can
 * have multiple executions (loop iterations); each has its own `id`.
 *
 * @property loopFrom Set when this execution was spawned by a feedback loop;
 *                    points to the {@link StepExecId} that triggered the loop.
 */
export type StepExecution = {
  id: StepExecId;
  stepId: StepId;
  instanceId: WorkflowId;
  status: StepExecStatus;
  inputArtifacts: ReadonlyArray<ArtifactId>;
  /**
   * Map of slot name → produced artifact for this execution. Empty for
   * side-effect steps (`workspace.set`, `human.gate`). The orchestrator and
   * downstream lookups query this by `Transition.fromPort` to pick the right
   * slot. For pre-migration events without a `port` field, the projection
   * routes the artifact to `"out"`.
   */
  outputs: ReadonlyMap<string, ArtifactId>;
  /**
   * @deprecated Derived from `outputs` — equals `outputs.get("out")` when the
   * step produced a single slot. Kept for compat with read sites pending the
   * Phase C cleanup. New code should read `outputs.get(port)` directly.
   */
  outputArtifact?: ArtifactId;
  runs: ReadonlyArray<RunId>;
  startedAt?: string;
  /**
   * Set when the step stops doing real work — i.e. on validation/failure, OR
   * on entering `awaitingHuman` (whichever fires first). For steps with a
   * human gate this is strictly earlier than `endedAt`; the `endedAt -
   * executionEndedAt` gap is the human wait time. For steps without a gate
   * the two are equal. Use this rather than `endedAt` when measuring step
   * compute time.
   */
  executionEndedAt?: string;
  endedAt?: string;
  humanFeedback?: { summary: string; comments: ReadonlyArray<ReviewComment> };
  loopFrom?: StepExecId;
  /**
   * Set on an execution that was invalidated by a `LoopOpened`. Carries the
   * event's `author` field verbatim: `"user"` for a human-triggered loop (via
   * `OpenFeedbackLoop`), `"llm.judge:${stepId}"` for an auto-loop triggered
   * by a judge step. Consumed by the UI (badge color) and by
   * `buildLoopHistory` to dispatch on the feedback source.
   */
  loopAuthor?: string;
  error?: string;
  /**
   * Set when this execution belongs to a loop iteration scope. Opaque key of
   * the form `${loopStepId}:${index}` (v1) — future: stacked
   * `${parent}|${child}` for nested loops. Two executions sharing this key
   * belong to the same iteration of the same loop scope. Absent for
   * executions outside any loop scope.
   */
  iterationKey?: string;
  /**
   * Set when this exec is a `template.invoke` that spawned a child instance
   * (`sub-template-invoke.md` §3). Points to the child {@link WorkflowId} the
   * parent is suspended on. Used by the orchestrator to find the child to wait
   * on, and by the UI to render a navigation link. Absent for every other kind.
   * Never populated in Phase A — no runner emits `ChildInstanceSpawned` yet.
   */
  childInstanceId?: WorkflowId;
};

/** Instance-level lifecycle status (aggregated from its executions). */
export type InstanceStatus = "running" | "awaitingHuman" | "completed" | "failed";

/**
 * The root aggregate for an execution of a template.
 *
 * @property templateVersion Pinned at start so the instance stays coherent
 *                           even if the template is republished.
 * @property seedArtifacts Initial inputs supplied by the user at
 *                         {@link StartInstance} time.
 */
export type WorkflowInstance = {
  id: WorkflowId;
  templateId: TemplateId;
  templateVersion: TemplateVersion;
  status: InstanceStatus;
  seedArtifacts: ReadonlyArray<ArtifactId>;
  executions: ReadonlyArray<StepExecution>;
  createdAt: string;
  /**
   * Channel that owns this instance. Frozen at start. Defaults to the seed
   * channel for any pre-migration event whose payload lacked the field.
   */
  channelId: string;
  /**
   * Current working directory used by native side-effects of this run
   * (currently the `cwd` passed to the Claude CLI). Initialized by
   * `InstanceStarted.cwd`, mutated by `WorkspaceChanged` events emitted
   * from `workspace.set` steps.
   */
  cwd?: string;
  /**
   * Current value of each template-declared variable for this instance —
   * keyed by `TemplateVariable.name`, valued by the `ArtifactId` last
   * assigned by a step's `writesTo`. Maintained by the projection from
   * `VariableAssigned` events (last-writer-wins). A variable that was never
   * assigned is simply absent from this map.
   */
  variables: ReadonlyMap<string, ArtifactId>;
  /**
   * Flattened template this instance actually runs against, computed by
   * `flattenTemplate` at start (`sub-template-expand.md` §6). Present **iff**
   * the root template contained at least one `workflow.call`; otherwise the
   * instance runs against the registry template by ref as before (backward
   * compatible). Frozen at start — immune to any republication of a
   * sub-template while the run is in flight, and embedded in `InstanceStarted`
   * so the journal replays deterministically.
   */
  effectiveTemplate?: WorkflowTemplate;
  /**
   * Set when this instance was spawned by a `template.invoke` step in another
   * instance (`sub-template-invoke.md` §3, Approach A). The parent is suspended
   * on the referenced {@link StepExecId} until this instance completes (or
   * fails). Absent for root instances (the UI-/scheduler-launched ones).
   *
   * This is the child-instance model, **distinct** from `workflow.call` /
   * `effectiveTemplate` (Approach B), which inlines a sub-template's graph into
   * a single instance and spawns no child. The two compose independently. Never
   * populated in Phase A — the spawning runner lands in Phase B.
   */
  parent?: {
    instanceId: WorkflowId;
    stepExecId: StepExecId;
  };
  /**
   * Invocation depth of this instance in the `template.invoke` tree: root = 0,
   * each spawned child = parent + 1 (`sub-template-invoke.md` §14). Bounded by
   * `MAX_INVOCATION_DEPTH` to guarantee termination on a deep acyclic chain.
   * Defaults to 0 for any pre-spec `InstanceStarted` event lacking the field.
   */
  depth: number;
  /**
   * Frozen snapshots of every sub-template referenced (directly or transitively)
   * by a `template.invoke` step in this run, keyed `${templateId}@${templateVersion}`
   * (`sub-template-invoke.md` §7). Captured at root-instance start so a republish
   * mid-run can't swap versions; children inherit the parent's snapshot rather
   * than re-resolving the live registry. Absent/empty when no `template.invoke`
   * is in play — which, in Phase A, is always (the step kind has no runner yet).
   */
  templateSnapshots?: ReadonlyMap<string, WorkflowTemplate>;
};
