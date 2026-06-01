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
};
