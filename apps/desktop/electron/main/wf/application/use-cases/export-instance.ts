/**
 * Use-case: gather the full state of a {@link WorkflowInstance} into a single
 * self-contained {@link RunExportBundle}. Drives the `export_run` built-in
 * step — see `specs/run-export-json.md`.
 *
 * The bundle is assembled from the immutable event log + the read-only ports;
 * the function itself performs **no writes**. Persisting the result as an
 * artifact is the runner's responsibility.
 */
import type {
  ArtifactExportEntry,
  FeedbackLoopExportView,
  InstanceExportView,
  RunExportBundle,
  StepExecExportView,
} from "@shared/wf/run-export";
import type { ArtifactContent, ArtifactStore } from "../ports/outbound/artifact-store";
import type { ClockPort } from "../ports/outbound/clock";
import type { EventLog } from "../ports/outbound/event-log";
import type { LlmSessionStore } from "../ports/outbound/llm-session-store";
import type { RunLog } from "../ports/outbound/run-log";
import type { TemplateRegistry } from "../ports/outbound/template-registry";
import type { DomainEvent } from "../../domain/events";
import type { FeedbackLoop, ReviewComment } from "../../domain/feedback";
import type { ArtifactId, LoopId, WorkflowId } from "../../domain/ids";
import type { StepExecution } from "../../domain/instance";
import { project, type InstanceState } from "../../domain/projection";

export class InstanceNotFoundError extends Error {
  constructor(readonly instanceId: WorkflowId) {
    super(`workflow instance not found: ${instanceId}`);
  }
}

type Deps = {
  eventLog: EventLog;
  runLog: RunLog;
  artifactStore: ArtifactStore;
  llmSessions: LlmSessionStore;
  templates: TemplateRegistry;
  clock: ClockPort;
};

export type ExportInstance = (instanceId: WorkflowId) => Promise<RunExportBundle>;

export const makeExportInstance =
  (deps: Deps, getAppVersion: () => string | undefined): ExportInstance =>
  async (instanceId: WorkflowId): Promise<RunExportBundle> => {
    const events = await deps.eventLog.readByInstance(instanceId);
    if (events.length === 0) {
      throw new InstanceNotFoundError(instanceId);
    }

    const state = project(events);
    if (!state) {
      throw new InstanceNotFoundError(instanceId);
    }

    const template = await deps.templates.resolve(
      state.templateId,
      state.templateVersion,
    );

    const artifactIds = collectArtifactIds(state);
    const loadedArtifacts = await Promise.all(
      [...artifactIds].map((id) => deps.artifactStore.get(id)),
    );

    const execExports: StepExecExportView[] = await Promise.all(
      state.executions.map(async (exec) => ({
        ...toStepExecExportView(exec),
        llmSession: await deps.llmSessions.listByStepExec(exec.id),
      })),
    );

    const runs = (
      await Promise.all(
        state.executions.map((e) => deps.runLog.listByStepExec(e.id)),
      )
    ).flat();

    const feedbackLoops = projectFeedbackLoops(events).map(toFeedbackLoopView);

    return {
      schemaVersion: 1,
      exportedAt: deps.clock.now(),
      exportedBy: { app: "ctxfirst-desktop", appVersion: getAppVersion() },
      instance: toInstanceExportView(state),
      template,
      executions: execExports,
      runs,
      artifacts: loadedArtifacts.map(toArtifactExportEntry),
      feedbackLoops,
      events,
    };
  };

/**
 * Returns every {@link ArtifactId} referenced anywhere in the instance
 * state: seeds, step inputs, and step outputs. Iterating once over each
 * execution keeps this O(n) in the number of executions.
 */
export const collectArtifactIds = (state: InstanceState): Set<ArtifactId> => {
  const ids = new Set<ArtifactId>(state.seedArtifacts);
  for (const exec of state.executions) {
    for (const inputId of exec.inputArtifacts) ids.add(inputId);
    for (const outputId of exec.outputs.values()) ids.add(outputId);
  }
  for (const variableId of state.variables.values()) ids.add(variableId);
  return ids;
};

const mapToRecord = <V>(m: ReadonlyMap<string, V>): Record<string, V> => {
  const out: Record<string, V> = {};
  for (const [k, v] of m) out[k] = v;
  return out;
};

export const toInstanceExportView = (state: InstanceState): InstanceExportView => ({
  id: state.id,
  templateId: state.templateId,
  templateVersion: state.templateVersion,
  status: state.status,
  createdAt: state.createdAt,
  cwd: state.cwd,
  seedArtifactIds: state.seedArtifacts,
  variables: mapToRecord(state.variables),
});

export const toStepExecExportView = (
  exec: StepExecution,
): Omit<StepExecExportView, "llmSession"> => ({
  id: exec.id,
  stepId: exec.stepId,
  status: exec.status,
  inputArtifactIds: exec.inputArtifacts,
  outputs: mapToRecord(exec.outputs),
  runIds: exec.runs,
  startedAt: exec.startedAt,
  executionEndedAt: exec.executionEndedAt,
  endedAt: exec.endedAt,
  iterationKey: exec.iterationKey,
  loopFrom: exec.loopFrom,
  error: exec.error,
  humanFeedback: exec.humanFeedback,
});

/**
 * Heuristic decision between embedding the artifact bytes as UTF-8 text or
 * as base64. The current artifact store is text-only (it reads files with
 * `utf8` decoding), so v1 always emits `"utf8"` — the branch is structural
 * preparation for a future store that exposes raw bytes.
 */
export const toArtifactExportEntry = ({
  meta,
  content,
}: ArtifactContent): ArtifactExportEntry => ({
  id: meta.id,
  kind: meta.kind,
  hash: meta.hash,
  createdAt: meta.createdAt,
  metadata: meta.metadata,
  content: {
    encoding: "utf8",
    size: Buffer.byteLength(content, "utf8"),
    data: content,
  },
});

type ProjectedLoop = {
  id: LoopId;
  instanceId: WorkflowId;
  fromStepExec: FeedbackLoop["fromStepExec"];
  toStepId: FeedbackLoop["toStepId"];
  reason: string;
  author: string;
  comments: ReadonlyArray<ReviewComment>;
  openedAt: string;
  closedAt: string | null;
};

/**
 * Second-pass projection over the event log to surface **every** feedback
 * loop — open and closed. `InstanceState.openLoops` only keeps the live
 * ones, so it's not enough on its own.
 *
 * Walking the events directly (rather than extending the main projection)
 * keeps the export concern isolated and avoids paying for it on the hot
 * path where only `openLoops` matters.
 */
export const projectFeedbackLoops = (
  events: ReadonlyArray<DomainEvent>,
): ReadonlyArray<ProjectedLoop> => {
  const loops = new Map<LoopId, ProjectedLoop>();
  for (const evt of events) {
    if (evt.type === "LoopOpened") {
      loops.set(evt.loopId, {
        id: evt.loopId,
        instanceId: evt.instanceId,
        fromStepExec: evt.fromStepExec,
        toStepId: evt.toStepId,
        reason: evt.reason,
        author: evt.author,
        comments: evt.comments ?? [],
        openedAt: evt.at,
        closedAt: null,
      });
    } else if (evt.type === "LoopClosed") {
      const existing = loops.get(evt.loopId);
      if (existing) existing.closedAt = evt.at;
    }
  }
  return [...loops.values()].sort((a, b) =>
    a.openedAt < b.openedAt ? -1 : a.openedAt > b.openedAt ? 1 : 0,
  );
};

const toFeedbackLoopView = (loop: ProjectedLoop): FeedbackLoopExportView => ({
  id: loop.id,
  fromStepExec: loop.fromStepExec,
  toStepId: loop.toStepId,
  reason: loop.reason,
  author: loop.author,
  openedAt: loop.openedAt,
  closedAt: loop.closedAt,
  comments: loop.comments,
});
