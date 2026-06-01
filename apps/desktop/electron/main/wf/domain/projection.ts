/**
 * Pure reducer that rebuilds a {@link WorkflowInstance}'s state from an ordered
 * sequence of {@link DomainEvent}s (event-sourcing projection). Called at boot
 * (re-hydration from SQLite) and incrementally as events are published.
 *
 * This file contains **no IO** — feed it events, get back a state.
 */
import { DEFAULT_CHANNEL_ID } from "./channel";
import type { DomainEvent } from "./events";
import type { ReviewComment } from "./feedback";
import type {
  ArtifactId,
  LoopId,
  StepExecId,
  StepId,
  TemplateId,
  TemplateVersion,
  WorkflowId,
} from "./ids";
import type {
  InstanceStatus,
  StepExecStatus,
  StepExecution,
  WorkflowInstance,
} from "./instance";
import type { StepKindId, WorkflowTemplate } from "./template";

/**
 * Projected instance with the additional `openLoops` readable view useful for
 * the UI. `openLoops` is empty once every `LoopOpened` has been matched by a
 * `LoopClosed`.
 */
export type InstanceState = WorkflowInstance & {
  openLoops: ReadonlyArray<{ id: LoopId; fromStepExec: StepExecId; toStepId: StepId; reason: string; author: string }>;
  /**
   * Iteration scopes opened by `loop.foreach` runs, keyed by the foreach's
   * `StepId`. Each iteration carries its opaque key, 0-based index, and the
   * per-item artifact id materialized by the orchestrator. Empty for
   * instances that have never crossed a foreach.
   */
  iterations: ReadonlyMap<StepId, ReadonlyArray<IterationRecord>>;
};

/**
 * Lightweight row used by the instance listing UI. Computed from the cached
 * {@link InstanceState} plus the timestamp of the last event (not part of the
 * projection since events carry that data outside the state).
 */
export type InstanceSummary = {
  id: WorkflowId;
  templateId: TemplateId;
  templateVersion: TemplateVersion;
  status: InstanceStatus;
  createdAt: string;
  updatedAt: string;
  activeStepId?: StepId;
  stepCount: number;
  channelId: string;
};

/**
 * Picks the execution the UI would consider "active" — mirrors the priority
 * used by the renderer: awaitingHuman > running > last validated > last.
 */
const pickActiveExecution = (state: InstanceState): StepExecution | null => {
  const execs = state.executions;
  const awaiting = execs.find((e) => e.status === "awaitingHuman");
  if (awaiting) return awaiting;
  const running = execs.find((e) => e.status === "running");
  if (running) return running;
  const lastValidated = [...execs].reverse().find((e) => e.status === "validated");
  if (lastValidated) return lastValidated;
  return execs.length > 0 ? execs[execs.length - 1] : null;
};

/**
 * Builds a {@link InstanceSummary} from an already-projected state and the
 * timestamp of its most recent event.
 */
export const summarize = (
  state: InstanceState,
  updatedAt: string,
): InstanceSummary => {
  const active = pickActiveExecution(state);
  return {
    id: state.id,
    templateId: state.templateId,
    templateVersion: state.templateVersion,
    status: state.status,
    createdAt: state.createdAt,
    updatedAt,
    activeStepId: active?.stepId,
    stepCount: state.executions.length,
    channelId: state.channelId,
  };
};

/** Mutable scratch record accumulated during reduction, finalized to {@link StepExecution}. */
type MutableStepExec = {
  id: StepExecId;
  stepId: StepId;
  kind: StepKindId;
  instanceId: WorkflowId;
  status: StepExecStatus;
  inputArtifacts: ArtifactId[];
  outputs: Map<string, ArtifactId>;
  outputArtifact?: ArtifactId;
  runs: string[];
  startedAt?: string;
  executionEndedAt?: string;
  endedAt?: string;
  humanFeedback?: { summary: string; comments: ReadonlyArray<ReviewComment> };
  loopFrom?: StepExecId;
  loopAuthor?: string;
  error?: string;
  iterationKey?: string;
};

/** Per-iteration mapping recorded by `IterationStarted` events. */
export type IterationRecord = {
  loopStepId: StepId;
  loopStepExecId: StepExecId;
  iterationKey: string;
  index: number;
  itemArtifactId: ArtifactId;
};

/**
 * Mutable accumulator threaded through {@link applyEvent}. Engine-state keeps
 * one of these per workflow instance so each new event costs O(1) work — the
 * old `project(events)` re-scanned the full history on every event.
 */
export type ProjectionScratch = {
  id: WorkflowId | null;
  templateId: TemplateId | null;
  templateVersion: TemplateVersion | null;
  /** Pinned flattened template (sub-workflows); see `InstanceStarted`. */
  effectiveTemplate?: WorkflowTemplate;
  status: InstanceStatus;
  seedArtifacts: ArtifactId[];
  createdAt: string | null;
  cwd?: string;
  channelId: string;
  execs: Map<StepExecId, MutableStepExec>;
  openLoops: Map<LoopId, { id: LoopId; fromStepExec: StepExecId; toStepId: StepId; reason: string; author: string }>;
  variables: Map<string, ArtifactId>;
  iterations: Map<StepId, IterationRecord[]>;
};

export const createScratch = (): ProjectionScratch => ({
  id: null,
  templateId: null,
  templateVersion: null,
  status: "running",
  seedArtifacts: [],
  createdAt: null,
  cwd: undefined,
  channelId: DEFAULT_CHANNEL_ID,
  execs: new Map(),
  openLoops: new Map(),
  variables: new Map(),
  iterations: new Map(),
});

/**
 * Applies a single event to `scratch` in place. Pure with respect to inputs
 * other than `scratch` itself.
 */
export const applyEvent = (scratch: ProjectionScratch, evt: DomainEvent): void => {
  switch (evt.type) {
    case "InstanceStarted":
      scratch.id = evt.instanceId;
      scratch.templateId = evt.templateId;
      scratch.templateVersion = evt.templateVersion;
      scratch.effectiveTemplate = evt.effectiveTemplate;
      scratch.seedArtifacts = [...evt.seed];
      scratch.createdAt = evt.at;
      scratch.status = "running";
      scratch.cwd = evt.cwd;
      // Pre-migration events lack `channelId`; route them to the default
      // channel rather than letting the field stay undefined.
      scratch.channelId = evt.channelId ?? DEFAULT_CHANNEL_ID;
      // Seed the variable store with template defaults resolved at launch.
      // Any later `VariableAssigned` overwrites a default (last-writer-wins),
      // so a consumer reading before any producer gets the default artifact
      // instead of `null`. Pre-migration events have no `variableDefaults`.
      for (const d of evt.variableDefaults ?? []) {
        scratch.variables.set(d.name, d.artifactId);
      }
      break;
    case "WorkspaceChanged":
      scratch.cwd = evt.cwd;
      break;
    case "StepStarted": {
      const existing = scratch.execs.get(evt.stepExecId);
      if (existing) {
        existing.status = "running";
        existing.startedAt = evt.at;
      } else {
        scratch.execs.set(evt.stepExecId, {
          id: evt.stepExecId,
          stepId: evt.stepId,
          kind: evt.kind,
          instanceId: evt.instanceId,
          status: "running",
          inputArtifacts: [...evt.inputArtifacts],
          outputs: new Map(),
          runs: [],
          startedAt: evt.at,
          loopFrom: evt.loopFrom,
          iterationKey: evt.iterationKey,
        });
      }
      if (
        scratch.status === "awaitingHuman" ||
        scratch.status === "completed" ||
        scratch.status === "failed"
      ) {
        scratch.status = "running";
      }
      break;
    }
    case "IterationStarted": {
      const bucket = scratch.iterations.get(evt.loopStepId) ?? [];
      bucket.push({
        loopStepId: evt.loopStepId,
        loopStepExecId: evt.loopStepExecId,
        iterationKey: evt.iterationKey,
        index: evt.index,
        itemArtifactId: evt.itemArtifactId,
      });
      scratch.iterations.set(evt.loopStepId, bucket);
      break;
    }
    case "StepProducedArtifact": {
      const e = scratch.execs.get(evt.stepExecId);
      if (e) {
        // Pre-migration events have no `port` — route them to the
        // conventional `"out"` slot so the scalar `outputArtifact` keeps
        // a sensible value during the Phase A → B transition.
        const port = evt.port ?? "out";
        e.outputs.set(port, evt.artifactId);
        // Keep the scalar `outputArtifact` in sync for legacy read sites:
        //  - if the slot is `"out"` (monomorphic convention) → always write,
        //  - else (multi-output runner) → write only the first slot the
        //    execution produced, so UI panels keyed on the scalar still get
        //    a principal artifact to display. Subsequent slots don't
        //    overwrite that pointer.
        if (port === "out" || e.outputArtifact === undefined) {
          e.outputArtifact = evt.artifactId;
        }
      }
      break;
    }
    case "StepAwaitingHumanGate": {
      const e = scratch.execs.get(evt.stepExecId);
      if (e) {
        e.status = "awaitingHuman";
        // Compute time stops here; `endedAt` will be set later when the
        // human validates. Don't overwrite if already set (defensive against
        // an out-of-order event stream).
        if (!e.executionEndedAt) e.executionEndedAt = evt.at;
      }
      scratch.status = "awaitingHuman";
      break;
    }
    case "StepValidated": {
      const e = scratch.execs.get(evt.stepExecId);
      if (e) {
        e.status = "validated";
        e.endedAt = evt.at;
        // For steps without a human gate, execution ends at validation too.
        if (!e.executionEndedAt) e.executionEndedAt = evt.at;
      }
      break;
    }
    case "StepFailed": {
      const e = scratch.execs.get(evt.stepExecId);
      if (e) {
        e.status = "failed";
        e.error = evt.error;
        e.endedAt = evt.at;
        if (!e.executionEndedAt) e.executionEndedAt = evt.at;
      }
      scratch.status = "failed";
      break;
    }
    case "StepSkipped": {
      // A skipped exec never ran — no startedAt / endedAt, no inputs, no
      // outputs. It exists in the projection so downstream resolution
      // (loadFromTransition + maybeStartConvergent) can read its terminal
      // state without re-traversing the graph.
      const existing = scratch.execs.get(evt.stepExecId);
      if (existing) {
        existing.status = "skipped";
      } else {
        scratch.execs.set(evt.stepExecId, {
          id: evt.stepExecId,
          stepId: evt.stepId,
          kind: evt.kind,
          instanceId: evt.instanceId,
          status: "skipped",
          inputArtifacts: [],
          outputs: new Map(),
          runs: [],
          iterationKey: evt.iterationKey,
        });
      }
      break;
    }
    case "LoopOpened":
      scratch.openLoops.set(evt.loopId, {
        id: evt.loopId,
        fromStepExec: evt.fromStepExec,
        toStepId: evt.toStepId,
        reason: evt.reason,
        author: evt.author,
      });
      {
        const e = scratch.execs.get(evt.fromStepExec);
        if (e) {
          e.status = "looped";
          e.loopAuthor = evt.author;
          // Materialize `humanFeedback` for human-triggered loops only —
          // i.e. anything that isn't a judge auto-loop. Judge loops emit
          // their feedback as a `Markdown` artifact on the `rejected` /
          // `exhausted` port; `buildLoopHistory` re-parses that artifact
          // (via `parseJudgeFeedback`) instead of relying on the projection.
          if (!evt.author.startsWith("llm.judge:")) {
            e.humanFeedback = {
              summary: evt.reason,
              comments: evt.comments ?? [],
            };
          }
        }
      }
      break;
    case "LoopClosed":
      scratch.openLoops.delete(evt.loopId);
      break;
    case "VariableAssigned":
      // Last-writer-wins: a subsequent assignment to the same variable
      // (typical loop pattern) overwrites the previous artifact pointer.
      scratch.variables.set(evt.variableName, evt.artifactId);
      break;
    case "InstanceCompleted":
      scratch.status = "completed";
      break;
  }
};

/**
 * Materializes the scratch into an immutable {@link InstanceState}. Returns
 * `null` if no `InstanceStarted` event has been applied yet.
 */
export const finalize = (scratch: ProjectionScratch): InstanceState | null => {
  if (!scratch.id || !scratch.templateId || !scratch.templateVersion || !scratch.createdAt) {
    return null;
  }
  const executions: StepExecution[] = [...scratch.execs.values()].map((e) => ({
    id: e.id,
    stepId: e.stepId,
    instanceId: e.instanceId,
    status: e.status,
    inputArtifacts: e.inputArtifacts,
    outputs: e.outputs,
    outputArtifact: e.outputArtifact,
    runs: [],
    startedAt: e.startedAt,
    executionEndedAt: e.executionEndedAt,
    endedAt: e.endedAt,
    humanFeedback: e.humanFeedback,
    loopFrom: e.loopFrom,
    loopAuthor: e.loopAuthor,
    error: e.error,
    iterationKey: e.iterationKey,
  }));

  return {
    id: scratch.id,
    templateId: scratch.templateId,
    templateVersion: scratch.templateVersion,
    effectiveTemplate: scratch.effectiveTemplate,
    status: scratch.status,
    seedArtifacts: scratch.seedArtifacts,
    executions,
    createdAt: scratch.createdAt,
    cwd: scratch.cwd,
    channelId: scratch.channelId,
    variables: scratch.variables,
    openLoops: [...scratch.openLoops.values()],
    iterations: scratch.iterations,
  };
};

/**
 * Folds an event stream into an {@link InstanceState}, or `null` if the stream
 * does not contain an `InstanceStarted` event.
 *
 * Deterministic: same events ⇒ same state.
 */
export const project = (events: ReadonlyArray<DomainEvent>): InstanceState | null => {
  const scratch = createScratch();
  for (const evt of events) applyEvent(scratch, evt);
  return finalize(scratch);
};

/**
 * Convenience accessor: the latest execution for a given {@link StepId} (useful
 * when a step has been re-executed via a loop and the UI only needs the head).
 */
export const lastExecutionForStep = (
  state: InstanceState,
  stepId: StepId,
): StepExecution | undefined => {
  const list = state.executions.filter((e) => e.stepId === stepId);
  return list.length > 0 ? list[list.length - 1] : undefined;
};

/** All executions (in order) for a given step — loop history included. */
export const executionsForStep = (
  state: InstanceState,
  stepId: StepId,
): ReadonlyArray<StepExecution> => state.executions.filter((e) => e.stepId === stepId);
