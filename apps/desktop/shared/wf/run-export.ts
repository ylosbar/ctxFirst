/**
 * Shape of the JSON bundle emitted by the `export_run` built-in step.
 *
 * The bundle is a single self-contained snapshot of a {@link WorkflowInstance}
 * — instance metadata, pinned template, all step executions (with inputs,
 * outputs, feedback, LLM session), all referenced artifacts (metadata +
 * inline content), all LLM run records, all feedback loops (open and closed)
 * and the raw event log. See `specs/run-export-json.md` for the rationale
 * behind each section.
 *
 * Lives in `shared/` so the use-case (main) and any future renderer-side
 * consumer (e.g. a "download bundle" action) can agree on the schema without
 * either side reaching across the IPC boundary.
 */
/* eslint-disable no-restricted-imports -- TODO(dette technique) : déplacer les types du moteur réutilisés dans le bundle d'export sous `shared/wf/` pour rompre la dépendance shared → electron/main/wf. Imports type-only, donc pas de risque runtime. */
import type { DomainEvent } from "../../electron/main/wf/domain/events";
import type {
  ArtifactHash,
  ArtifactId,
  LoopId,
  RunId,
  StepExecId,
  StepId,
  TemplateId,
  TemplateVersion,
  WorkflowId,
} from "../../electron/main/wf/domain/ids";
import type { ReviewComment } from "../../electron/main/wf/domain/feedback";
import type {
  InstanceStatus,
  StepExecStatus,
} from "../../electron/main/wf/domain/instance";
import type { WorkflowTemplate } from "../../electron/main/wf/domain/template";
import type { ArtifactKind } from "../../electron/main/wf/domain/artifact";
import type { LlmSessionEvent } from "../../electron/main/wf/application/ports/outbound/event-bus";
import type { RunRecord } from "../../electron/main/wf/application/ports/outbound/run-log";

/**
 * Mirror of {@link WorkflowInstance} with `Map`-valued fields serialized as
 * `Record`s so `JSON.stringify` round-trips lossless. `executions` is split
 * out at the top level of the bundle and is not duplicated here.
 */
export type InstanceExportView = {
  id: WorkflowId;
  templateId: TemplateId;
  templateVersion: TemplateVersion;
  status: InstanceStatus;
  createdAt: string;
  cwd?: string;
  seedArtifactIds: ReadonlyArray<ArtifactId>;
  variables: Readonly<Record<string, ArtifactId>>;
};

/**
 * Mirror of {@link StepExecution} with `outputs: Map` → `Record` and an
 * embedded slice of {@link LlmSessionEvent}s pulled from the LLM session
 * store.
 */
export type StepExecExportView = {
  id: StepExecId;
  stepId: StepId;
  status: StepExecStatus;
  inputArtifactIds: ReadonlyArray<ArtifactId>;
  outputs: Readonly<Record<string, ArtifactId>>;
  runIds: ReadonlyArray<RunId>;
  startedAt?: string;
  executionEndedAt?: string;
  endedAt?: string;
  iterationKey?: string;
  loopFrom?: StepExecId;
  error?: string;
  humanFeedback?: {
    summary: string;
    comments: ReadonlyArray<ReviewComment>;
  };
  llmSession: ReadonlyArray<LlmSessionEvent>;
};

/**
 * One artifact, metadata + content inline. The `encoding` field is reserved
 * for future binary support — v1 always emits `"utf8"` because the artifact
 * store is text-only today. `size` is the byte length of the decoded
 * payload (i.e. of the original UTF-8 string, never the base64 envelope).
 */
export type ArtifactExportEntry = {
  id: ArtifactId;
  kind: ArtifactKind;
  hash: ArtifactHash;
  createdAt: string;
  metadata: Readonly<Record<string, string>>;
  content: {
    encoding: "utf8" | "base64";
    size: number;
    data: string;
  };
};

/**
 * Feedback loop entry covering both open and closed loops. `closedAt` is
 * `null` while the loop is still open.
 */
export type FeedbackLoopExportView = {
  id: LoopId;
  fromStepExec: StepExecId;
  toStepId: StepId;
  reason: string;
  author: string;
  openedAt: string;
  closedAt: string | null;
  comments: ReadonlyArray<ReviewComment>;
};

/** Top-level bundle produced by `export_run`. */
export type RunExportBundle = {
  schemaVersion: 1;
  exportedAt: string;
  exportedBy: { app: "ctxfirst-desktop"; appVersion?: string };
  instance: InstanceExportView;
  template: WorkflowTemplate;
  executions: ReadonlyArray<StepExecExportView>;
  runs: ReadonlyArray<RunRecord>;
  artifacts: ReadonlyArray<ArtifactExportEntry>;
  feedbackLoops: ReadonlyArray<FeedbackLoopExportView>;
  events: ReadonlyArray<DomainEvent>;
};
