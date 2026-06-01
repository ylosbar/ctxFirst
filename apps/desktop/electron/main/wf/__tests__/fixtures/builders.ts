import type { DomainEvent } from "../../domain/events";
import {
  asArtifactId,
  asEventId,
  asLoopId,
  asStepExecId,
  asStepId,
  asTemplateId,
  asTemplateVersion,
  asWorkflowId,
  type ArtifactId,
  type LoopId,
  type StepExecId,
  type StepId,
  type TemplateId,
  type TemplateVersion,
  type WorkflowId,
} from "../../domain/ids";
import type {
  ActorRole,
  StepDef,
  StepKindId,
  TemplateVariable,
  Transition,
  WorkflowTemplate,
} from "../../domain/template";

// ---------- Template builder ----------

export type BuildStep = {
  id: string;
  kind: StepKindId;
  name?: string;
  actorRole?: ActorRole;
  humanGateRequired?: boolean;
  config?: Readonly<Record<string, unknown>>;
  writesTo?: Readonly<Record<string, string>>;
  readsFrom?: Readonly<Record<string, string>>;
};

export type BuildTransition = {
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
  isLoop?: boolean;
  order?: number;
};

export type BuildTemplateOptions = {
  id?: string;
  version?: string;
  description?: string;
  variables?: ReadonlyArray<TemplateVariable>;
  entryStep?: string;
  exitSteps?: ReadonlyArray<string>;
  status?: "draft" | "published";
};

export const buildTemplate = (
  name: string,
  steps: ReadonlyArray<BuildStep>,
  transitions: ReadonlyArray<BuildTransition>,
  opts: BuildTemplateOptions = {},
): WorkflowTemplate => {
  const id = (opts.id ?? name) as string;
  const version = opts.version ?? "v1";

  const stepDefs: StepDef[] = steps.map((s) => ({
    id: asStepId(s.id),
    name: s.name ?? s.id,
    kind: s.kind,
    actorRole: s.actorRole ?? "Developer",
    config: s.config ?? {},
    humanGateRequired: s.humanGateRequired ?? false,
    writesTo: s.writesTo,
    readsFrom: s.readsFrom,
  }));

  const txs: Transition[] = transitions.map((t) => ({
    from: asStepId(t.from),
    to: asStepId(t.to),
    fromPort: t.fromPort,
    toPort: t.toPort,
    isLoop: t.isLoop ?? false,
    order: t.order,
  }));

  const entry = opts.entryStep ?? steps[0]?.id;
  if (!entry) throw new Error("buildTemplate: at least one step required");
  const exits = opts.exitSteps ?? [steps[steps.length - 1].id];

  return {
    id: asTemplateId(id),
    name,
    description: opts.description ?? "",
    version: asTemplateVersion(version),
    entryStep: asStepId(entry),
    exitSteps: exits.map((s) => asStepId(s)),
    steps: stepDefs,
    transitions: txs,
    variables: opts.variables ?? [],
    status: opts.status ?? "published",
  };
};

// ---------- Event builders ----------

type Counter = { n: number };
const makeCounter = (): Counter => ({ n: 0 });

/**
 * Returns an event builder family bound to a specific instance id. Each call
 * to one of the builders mints a fresh `eventId` and increments the embedded
 * counter — useful when assertions care about event order.
 */
export const buildEventsFor = (instanceId: WorkflowId, startAt: string = "2026-01-01T00:00:00.000Z") => {
  const counter = makeCounter();
  let clock = Date.parse(startAt);
  const nextAt = () => {
    clock += 1;
    return new Date(clock).toISOString();
  };
  const nextId = () => {
    counter.n += 1;
    return asEventId(`evt-${counter.n}`);
  };

  type CommonEvt<T extends DomainEvent["type"]> = Omit<
    Extract<DomainEvent, { type: T }>,
    "eventId" | "at" | "instanceId" | "type"
  >;

  return {
    instanceStarted: (over: Partial<CommonEvt<"InstanceStarted">> = {}): DomainEvent => ({
      type: "InstanceStarted",
      eventId: nextId(),
      at: nextAt(),
      instanceId,
      templateId: over.templateId ?? asTemplateId("tpl"),
      templateVersion: over.templateVersion ?? asTemplateVersion("v1"),
      seed: over.seed ?? [],
      ...(over.cwd ? { cwd: over.cwd } : {}),
      ...(over.channelId ? { channelId: over.channelId } : {}),
    }),
    stepStarted: (over: Partial<CommonEvt<"StepStarted">> & { stepExecId?: string; stepId?: string } = {}): DomainEvent => ({
      type: "StepStarted",
      eventId: nextId(),
      at: nextAt(),
      instanceId,
      stepExecId: over.stepExecId ?? asStepExecId(`exec-${counter.n}`),
      stepId: over.stepId ?? asStepId(`step-${counter.n}`),
      kind: over.kind ?? "user.input",
      inputArtifacts: over.inputArtifacts ?? [],
      loopFrom: over.loopFrom,
      iterationKey: over.iterationKey,
    }),
    stepProducedArtifact: (over: Partial<CommonEvt<"StepProducedArtifact">> & { stepExecId?: string; artifactId?: string } = {}): DomainEvent => ({
      type: "StepProducedArtifact",
      eventId: nextId(),
      at: nextAt(),
      instanceId,
      stepExecId: over.stepExecId ?? asStepExecId("exec-0"),
      artifactId: over.artifactId ?? asArtifactId(`artifact-${counter.n}`),
      port: over.port,
    }),
    stepAwaitingHumanGate: (over: Partial<CommonEvt<"StepAwaitingHumanGate">> & { stepExecId?: string } = {}): DomainEvent => ({
      type: "StepAwaitingHumanGate",
      eventId: nextId(),
      at: nextAt(),
      instanceId,
      stepExecId: over.stepExecId ?? asStepExecId("exec-0"),
      actorRole: over.actorRole ?? "Developer",
    }),
    stepValidated: (over: Partial<CommonEvt<"StepValidated">> & { stepExecId?: string } = {}): DomainEvent => ({
      type: "StepValidated",
      eventId: nextId(),
      at: nextAt(),
      instanceId,
      stepExecId: over.stepExecId ?? asStepExecId("exec-0"),
      by: over.by ?? "auto",
    }),
    stepFailed: (over: Partial<CommonEvt<"StepFailed">> & { stepExecId?: string } = {}): DomainEvent => ({
      type: "StepFailed",
      eventId: nextId(),
      at: nextAt(),
      instanceId,
      stepExecId: over.stepExecId ?? asStepExecId("exec-0"),
      error: over.error ?? "boom",
    }),
    loopOpened: (over: Partial<CommonEvt<"LoopOpened">> & { loopId?: string; fromStepExec?: string; toStepId?: string } = {}): DomainEvent => ({
      type: "LoopOpened",
      eventId: nextId(),
      at: nextAt(),
      instanceId,
      loopId: over.loopId ?? asLoopId(`loop-${counter.n}`),
      fromStepExec: over.fromStepExec ?? asStepExecId("exec-0"),
      toStepId: over.toStepId ?? asStepId("step-0"),
      reason: over.reason ?? "",
      comments: over.comments,
      author: over.author ?? "user",
    }),
    loopClosed: (over: Partial<CommonEvt<"LoopClosed">> & { loopId?: string } = {}): DomainEvent => ({
      type: "LoopClosed",
      eventId: nextId(),
      at: nextAt(),
      instanceId,
      loopId: over.loopId ?? asLoopId(`loop-${counter.n}`),
    }),
    instanceCompleted: (over: Partial<CommonEvt<"InstanceCompleted">> = {}): DomainEvent => ({
      type: "InstanceCompleted",
      eventId: nextId(),
      at: nextAt(),
      instanceId,
      finalArtifact: over.finalArtifact,
    }),
    workspaceChanged: (over: Partial<CommonEvt<"WorkspaceChanged">> & { stepExecId?: string } = {}): DomainEvent => ({
      type: "WorkspaceChanged",
      eventId: nextId(),
      at: nextAt(),
      instanceId,
      stepExecId: over.stepExecId ?? asStepExecId("exec-0"),
      cwd: over.cwd ?? "/tmp/ws",
    }),
  };
};

// ---------- Reusable id helpers ----------

export const ids = {
  template: (id: string, version = "v1") => ({
    id: asTemplateId(id),
    version: asTemplateVersion(version),
  }),
  workflow: (s: string) => asWorkflowId(s),
  step: (s: string) => asStepId(s),
  stepExec: (s: string) => asStepExecId(s),
  artifact: (s: string) => asArtifactId(s),
  loop: (s: string) => asLoopId(s),
} as const;

// ---------- Curated reusable templates ----------

/**
 * Minimal template `user.input → human.gate`. Default seed kind: Markdown.
 * Used as the workhorse for orchestrator happy-path tests.
 */
export const TEMPLATE_LINEAR: WorkflowTemplate = buildTemplate(
  "linear",
  [
    {
      id: "input",
      kind: "user.input",
      humanGateRequired: false,
      config: { outputKind: "Markdown" },
    },
    {
      id: "gate",
      kind: "human.gate",
      humanGateRequired: true,
      config: { inputKind: "Markdown", role: "Developer" },
    },
  ],
  [{ from: "input", to: "gate" }],
  { id: "linear", version: "v1", exitSteps: ["gate"] },
);

/** Re-export ID brand helpers so test files don't have to import twice. */
export {
  asArtifactId,
  asEventId,
  asStepExecId,
  asStepId,
  asTemplateId,
  asTemplateVersion,
  asWorkflowId,
};
export type { ArtifactId, LoopId, StepExecId, StepId, TemplateId, TemplateVersion, WorkflowId };
