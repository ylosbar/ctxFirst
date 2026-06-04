import { describe, expect, it } from "vitest";
import type { DomainEvent } from "./events";
import {
  asArtifactId,
  asEventId,
  asLoopId,
  asStepExecId,
  asStepId,
  asTemplateId,
  asTemplateVersion,
  asWorkflowId,
} from "./ids";
import {
  executionsForStep,
  lastExecutionForStep,
  project,
  summarize,
} from "./projection";

const INSTANCE = asWorkflowId("wf-1");
const TPL = asTemplateId("feature-from-spec");
const VER = asTemplateVersion("v1");

let clock = 0;
const at = () => {
  clock += 1;
  return `2026-01-01T00:00:${String(clock).padStart(2, "0")}.000Z`;
};
let eventCounter = 0;
const evtId = () => asEventId(`evt-${++eventCounter}`);

const started: DomainEvent = {
  type: "InstanceStarted",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
  templateId: TPL,
  templateVersion: VER,
  seed: [asArtifactId("seed-1")],
};

const stepStart = (stepId: string, execId: string, loopFrom?: string): DomainEvent => ({
  type: "StepStarted",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
  stepExecId: asStepExecId(execId),
  stepId: asStepId(stepId),
  kind: "user.input",
  inputArtifacts: [],
  loopFrom: loopFrom ? asStepExecId(loopFrom) : undefined,
});

const stepOutput = (execId: string, artifactId: string): DomainEvent => ({
  type: "StepProducedArtifact",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
  stepExecId: asStepExecId(execId),
  artifactId: asArtifactId(artifactId),
});

const stepAwaiting = (execId: string): DomainEvent => ({
  type: "StepAwaitingHumanGate",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
  stepExecId: asStepExecId(execId),
  actorRole: "PO",
});

const stepValidated = (execId: string, by = "auto"): DomainEvent => ({
  type: "StepValidated",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
  stepExecId: asStepExecId(execId),
  by,
});

const stepFailed = (execId: string, error: string): DomainEvent => ({
  type: "StepFailed",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
  stepExecId: asStepExecId(execId),
  error,
});

const loopOpened = (
  loopId: string,
  fromExec: string,
  toStep: string,
  reason = "redo",
): DomainEvent => ({
  type: "LoopOpened",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
  loopId: asLoopId(loopId),
  fromStepExec: asStepExecId(fromExec),
  toStepId: asStepId(toStep),
  reason,
  author: "po@x",
});

const loopClosed = (loopId: string): DomainEvent => ({
  type: "LoopClosed",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
  loopId: asLoopId(loopId),
});

const completed: DomainEvent = {
  type: "InstanceCompleted",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
};

describe("project — base cases", () => {
  it("returns null on an empty stream", () => {
    expect(project([])).toBeNull();
  });

  it("returns null when InstanceStarted is missing", () => {
    expect(project([stepStart("a", "exec-a")])).toBeNull();
  });

  it("hydrates instance identity and seed from InstanceStarted", () => {
    const state = project([started]);
    expect(state).not.toBeNull();
    expect(state!.id).toBe(INSTANCE);
    expect(state!.templateId).toBe(TPL);
    expect(state!.templateVersion).toBe(VER);
    expect(state!.status).toBe("running");
    expect(state!.seedArtifacts).toEqual([asArtifactId("seed-1")]);
    expect(state!.executions).toHaveLength(0);
  });

  it("initializes cwd from InstanceStarted.cwd when provided", () => {
    const state = project([{ ...started, cwd: "/tmp/run" }])!;
    expect(state.cwd).toBe("/tmp/run");
  });

  it("leaves cwd undefined when InstanceStarted has no cwd", () => {
    expect(project([started])!.cwd).toBeUndefined();
  });
});

describe("project — workspace", () => {
  it("updates cwd on WorkspaceChanged", () => {
    const state = project([
      { ...started, cwd: "/initial" },
      stepStart("ws", "exec-ws"),
      {
        type: "WorkspaceChanged",
        eventId: evtId(),
        at: at(),
        instanceId: INSTANCE,
        stepExecId: asStepExecId("exec-ws"),
        cwd: "/new",
      },
    ])!;
    expect(state.cwd).toBe("/new");
  });
});

describe("project — step lifecycle", () => {
  it("transitions running → awaitingHuman → validated", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepOutput("exec-a", "art-1"),
      stepAwaiting("exec-a"),
    ])!;
    expect(state.status).toBe("awaitingHuman");
    expect(state.executions[0].status).toBe("awaitingHuman");
    expect(state.executions[0].outputArtifact).toBe("art-1");

    const validated = project([
      started,
      stepStart("a", "exec-a"),
      stepOutput("exec-a", "art-1"),
      stepAwaiting("exec-a"),
      stepValidated("exec-a", "yoann"),
    ])!;
    expect(validated.executions[0].status).toBe("validated");
    expect(validated.executions[0].endedAt).toBeDefined();
    // For a gated step, `executionEndedAt` is set when the gate opens, NOT
    // when the human validates. So it's strictly earlier than `endedAt`.
    const exec = validated.executions[0];
    expect(exec.executionEndedAt).toBeDefined();
    expect(Date.parse(exec.executionEndedAt as string)).toBeLessThanOrEqual(
      Date.parse(exec.endedAt as string),
    );
  });

  it("for a step without a gate, executionEndedAt === endedAt", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepValidated("exec-a"),
    ])!;
    const exec = state.executions[0];
    expect(exec.executionEndedAt).toBe(exec.endedAt);
  });

  it("marks the instance failed when any execution fails", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepFailed("exec-a", "boom"),
    ])!;
    expect(state.status).toBe("failed");
    expect(state.executions[0].status).toBe("failed");
    expect(state.executions[0].error).toBe("boom");
  });

  it("marks the instance completed on InstanceCompleted", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepValidated("exec-a"),
      completed,
    ])!;
    expect(state.status).toBe("completed");
  });
});

describe("project — feedback loops", () => {
  it("opens a loop, marks the source exec as looped, and exposes openLoops", () => {
    const state = project([
      started,
      stepStart("gen", "exec-gen-1"),
      stepOutput("exec-gen-1", "art-1"),
      stepValidated("exec-gen-1"),
      stepStart("validate", "exec-val-1"),
      stepAwaiting("exec-val-1"),
      loopOpened("loop-1", "exec-val-1", "gen", "please redo"),
    ])!;

    const valExec = state.executions.find((e) => e.id === "exec-val-1")!;
    expect(valExec.status).toBe("looped");
    expect(valExec.humanFeedback?.summary).toBe("please redo");
    expect(state.openLoops).toHaveLength(1);
    expect(state.openLoops[0].id).toBe("loop-1");
  });

  it("closes a loop once LoopClosed is received", () => {
    const state = project([
      started,
      stepStart("gen", "exec-gen-1"),
      stepValidated("exec-gen-1"),
      stepStart("validate", "exec-val-1"),
      loopOpened("loop-1", "exec-val-1", "gen"),
      loopClosed("loop-1"),
    ])!;
    expect(state.openLoops).toHaveLength(0);
  });

  it("tracks multiple executions for the same step via loopFrom", () => {
    const state = project([
      started,
      stepStart("gen", "exec-gen-1"),
      stepValidated("exec-gen-1"),
      stepStart("validate", "exec-val-1"),
      loopOpened("loop-1", "exec-val-1", "gen"),
      stepStart("gen", "exec-gen-2", "exec-val-1"),
      stepOutput("exec-gen-2", "art-2"),
      loopClosed("loop-1"),
    ])!;

    const genExecs = executionsForStep(state, asStepId("gen"));
    expect(genExecs).toHaveLength(2);
    expect(genExecs[1].loopFrom).toBe("exec-val-1");

    const last = lastExecutionForStep(state, asStepId("gen"))!;
    expect(last.id).toBe("exec-gen-2");
    expect(last.outputArtifact).toBe("art-2");
  });
});

describe("project — variables (VariableAssigned)", () => {
  const varAssigned = (
    execId: string,
    variableName: string,
    artifactId: string,
  ): DomainEvent => ({
    type: "VariableAssigned",
    eventId: evtId(),
    at: at(),
    instanceId: INSTANCE,
    stepExecId: asStepExecId(execId),
    variableName,
    artifactId: asArtifactId(artifactId),
  });

  it("initializes variables as an empty map when no VariableAssigned events exist", () => {
    const state = project([started, stepStart("a", "exec-a")])!;
    expect(state.variables).toBeDefined();
    expect(state.variables.size).toBe(0);
  });

  it("stores a variable assignment", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepOutput("exec-a", "art-1"),
      varAssigned("exec-a", "draft", "art-1"),
    ])!;
    expect(state.variables.get("draft")).toBe("art-1");
  });

  it("applies last-writer-wins when the same variable is reassigned", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepOutput("exec-a", "art-1"),
      varAssigned("exec-a", "draft", "art-1"),
      stepValidated("exec-a"),
      stepStart("a", "exec-a-2"),
      stepOutput("exec-a-2", "art-2"),
      varAssigned("exec-a-2", "draft", "art-2"),
    ])!;
    expect(state.variables.get("draft")).toBe("art-2");
  });

  it("stores multiple independent variables", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepOutput("exec-a", "art-1"),
      varAssigned("exec-a", "draft", "art-1"),
      varAssigned("exec-a", "ticket", "art-ticket"),
    ])!;
    expect(state.variables.get("draft")).toBe("art-1");
    expect(state.variables.get("ticket")).toBe("art-ticket");
    expect(state.variables.size).toBe(2);
  });

  it("seeds variables from InstanceStarted.variableDefaults before any step", () => {
    const state = project([
      {
        ...started,
        variableDefaults: [
          { name: "tone", artifactId: asArtifactId("art-default") },
        ],
      },
    ])!;
    expect(state.variables.get("tone")).toBe("art-default");
    expect(state.variables.size).toBe(1);
  });

  it("lets a VariableAssigned overwrite a seeded default (last-writer-wins)", () => {
    const state = project([
      {
        ...started,
        variableDefaults: [
          { name: "draft", artifactId: asArtifactId("art-default") },
        ],
      },
      stepStart("a", "exec-a"),
      stepOutput("exec-a", "art-1"),
      varAssigned("exec-a", "draft", "art-1"),
    ])!;
    expect(state.variables.get("draft")).toBe("art-1");
  });

  it("treats InstanceStarted without variableDefaults as no defaults", () => {
    const state = project([started])!;
    expect(state.variables.size).toBe(0);
  });

  it("replays a pre-migration journal (no VariableAssigned) with variables.size === 0", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepOutput("exec-a", "art-1"),
      stepValidated("exec-a"),
      completed,
    ])!;
    expect(state.variables.size).toBe(0);
    expect(state.status).toBe("completed");
  });

  it("replays a mixed journal (old events + VariableAssigned) idempotently", () => {
    const events: DomainEvent[] = [
      started,
      stepStart("a", "exec-a"),
      stepOutput("exec-a", "art-1"),
      varAssigned("exec-a", "desc", "art-1"),
      stepValidated("exec-a"),
      stepStart("b", "exec-b"),
      stepOutput("exec-b", "art-2"),
      stepValidated("exec-b"),
    ];
    const first = project(events)!;
    const second = project(events)!;
    expect(first).toEqual(second);
    expect(first.variables.get("desc")).toBe("art-1");
  });
});

describe("project — determinism", () => {
  it("produces equal states for two replays of the same event stream", () => {
    const events: DomainEvent[] = [
      started,
      stepStart("a", "exec-a"),
      stepOutput("exec-a", "art-1"),
      stepAwaiting("exec-a"),
      stepValidated("exec-a", "yoann"),
    ];
    expect(project(events)).toEqual(project(events));
  });
});

describe("summarize", () => {
  it("picks the awaitingHuman execution as active when one exists", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepValidated("exec-a"),
      stepStart("b", "exec-b"),
      stepAwaiting("exec-b"),
    ])!;
    const sum = summarize(state, at());
    expect(sum.activeStepId).toBe("b");
    expect(sum.stepCount).toBe(2);
    expect(sum.status).toBe("awaitingHuman");
  });

  it("prefers a running execution over the last validated one", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepValidated("exec-a"),
      stepStart("b", "exec-b"),
    ])!;
    const sum = summarize(state, at());
    expect(sum.activeStepId).toBe("b");
  });

  it("falls back to the last validated execution when nothing is active", () => {
    const state = project([
      started,
      stepStart("a", "exec-a"),
      stepValidated("exec-a"),
    ])!;
    const sum = summarize(state, at());
    expect(sum.activeStepId).toBe("a");
  });

  it("leaves activeStepId undefined when no execution exists", () => {
    const state = project([started])!;
    const sum = summarize(state, at());
    expect(sum.activeStepId).toBeUndefined();
    expect(sum.stepCount).toBe(0);
  });

  it("propagates the supplied updatedAt verbatim", () => {
    const state = project([started])!;
    const stamp = "2030-12-31T23:59:59.000Z";
    expect(summarize(state, stamp).updatedAt).toBe(stamp);
  });
});

// ---------------------------------------------------------------------------
// `template.invoke` Phase A — model groundwork (sub-template-invoke.md).
// The runner/orchestrator that EMIT these events land in Phase B; here we only
// assert the projection accepts and folds them, that legacy streams are
// unchanged, and that the new InstanceStarted fields project.
// ---------------------------------------------------------------------------

const CHILD = asWorkflowId("wf-child");

const childSpawned = (parentExec: string, childId = CHILD): DomainEvent => ({
  type: "ChildInstanceSpawned",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
  stepExecId: asStepExecId(parentExec),
  childInstanceId: childId,
  childTemplateId: asTemplateId("sub-tpl"),
  childTemplateVersion: asTemplateVersion("v1"),
  seedBindings: [{ variableName: "spec", artifactId: asArtifactId("seed-1") }],
});

const childCompleted = (
  parentExec: string,
  opts: {
    outcome: "completed" | "failed";
    outputs?: ReadonlyArray<{ variableName: string; artifactId: string }>;
    error?: string;
    childId?: string;
  },
): DomainEvent => ({
  type: "ChildInstanceCompleted",
  eventId: evtId(),
  at: at(),
  instanceId: INSTANCE,
  stepExecId: asStepExecId(parentExec),
  childInstanceId: asWorkflowId(opts.childId ?? CHILD),
  outcome: opts.outcome,
  outputs: (opts.outputs ?? []).map((o) => ({
    variableName: o.variableName,
    artifactId: asArtifactId(o.artifactId),
  })),
  ...(opts.error ? { error: opts.error } : {}),
});

describe("project — template.invoke child instances (Phase A)", () => {
  it("ChildInstanceSpawned sets childInstanceId and parks the step in awaitingChild", () => {
    const state = project([
      started,
      stepStart("inv", "exec-inv"),
      childSpawned("exec-inv"),
    ])!;
    expect(state.executions[0].status).toBe("awaitingChild");
    expect(state.executions[0].childInstanceId).toBe(CHILD);
    // The instance reuses the "awaitingHuman" aggregate (no dedicated status).
    expect(state.status).toBe("awaitingHuman");
    // Compute time stops at the spawn, like a human gate.
    expect(state.executions[0].executionEndedAt).toBeDefined();
    expect(state.executions[0].endedAt).toBeUndefined();
  });

  it("ChildInstanceCompleted{completed} re-activates the parent step (running)", () => {
    const state = project([
      started,
      stepStart("inv", "exec-inv"),
      childSpawned("exec-inv"),
      childCompleted("exec-inv", {
        outcome: "completed",
        outputs: [{ variableName: "summary", artifactId: "art-out" }],
      }),
    ])!;
    // Back to running — the orchestrator then assigns outputs + emits
    // StepValidated (that chain is orchestrated, not projected).
    expect(state.executions[0].status).toBe("running");
    expect(state.executions[0].error).toBeUndefined();
  });

  it("a subsequent StepValidated after a completed child advances normally", () => {
    const state = project([
      started,
      stepStart("inv", "exec-inv"),
      childSpawned("exec-inv"),
      childCompleted("exec-inv", { outcome: "completed" }),
      stepValidated("exec-inv"),
    ])!;
    expect(state.executions[0].status).toBe("validated");
  });

  it("ChildInstanceCompleted{failed} fails the parent step and propagates the error", () => {
    const state = project([
      started,
      stepStart("inv", "exec-inv"),
      childSpawned("exec-inv"),
      childCompleted("exec-inv", { outcome: "failed", error: "child blew up" }),
    ])!;
    expect(state.executions[0].status).toBe("failed");
    expect(state.executions[0].error).toBe("child blew up");
    expect(state.status).toBe("failed");
  });

  it("a child-waiting step is the instance's active execution (summarize)", () => {
    const state = project([
      started,
      stepStart("inv", "exec-inv"),
      childSpawned("exec-inv"),
    ])!;
    expect(summarize(state, at()).activeStepId).toBe("inv");
  });

  it("is a no-op when the parent exec is unknown (replay safety net)", () => {
    // Both child events reference an exec that was never started.
    const spawnOrphan = project([started, childSpawned("ghost-exec")])!;
    expect(spawnOrphan.status).toBe("awaitingHuman"); // instance-level still flips
    expect(spawnOrphan.executions).toHaveLength(0); // but no phantom exec created

    const completeOrphan = project([
      started,
      childCompleted("ghost-exec", { outcome: "failed", error: "x" }),
    ])!;
    // Failure still marks the instance failed, but no phantom exec is created.
    expect(completeOrphan.executions).toHaveLength(0);
  });
});

describe("project — InstanceStarted Approach-A fields (Phase A)", () => {
  it("defaults depth to 0, parent undefined and no snapshots on legacy events", () => {
    const state = project([started])!;
    expect(state.depth).toBe(0);
    expect(state.parent).toBeUndefined();
    expect(state.templateSnapshots).toBeUndefined();
  });

  it("projects depth, parent and templateSnapshots when present", () => {
    const snapTpl = {
      id: asTemplateId("sub-tpl"),
      name: "Sub",
      description: "",
      version: asTemplateVersion("v1"),
      entryStep: asStepId("s0"),
      exitSteps: [asStepId("s0")],
      steps: [],
      transitions: [],
      variables: [],
      status: "published" as const,
    };
    const state = project([
      {
        ...started,
        depth: 2,
        parent: {
          instanceId: asWorkflowId("wf-parent"),
          stepExecId: asStepExecId("exec-parent"),
        },
        templateSnapshots: [{ ref: "sub-tpl@v1", template: snapTpl }],
      },
    ])!;
    expect(state.depth).toBe(2);
    expect(state.parent).toEqual({
      instanceId: asWorkflowId("wf-parent"),
      stepExecId: asStepExecId("exec-parent"),
    });
    expect(state.templateSnapshots?.get("sub-tpl@v1")).toEqual(snapTpl);
  });

  it("resumes a child-waiting step back to running on a later StepStarted", () => {
    // Mirrors the awaitingHuman resume path: a re-entry StepStarted on the
    // same exec flips the instance back to running.
    const state = project([
      started,
      stepStart("inv", "exec-inv"),
      childSpawned("exec-inv"),
      stepStart("inv", "exec-inv"),
    ])!;
    expect(state.status).toBe("running");
    expect(state.executions[0].status).toBe("running");
  });
});

describe("project — replay equivalence with no child events", () => {
  it("a pre-spec stream projects identically (no Approach-A leakage)", () => {
    const legacy = [
      started,
      stepStart("a", "exec-a"),
      stepValidated("exec-a"),
      completed,
    ];
    const state = project(legacy)!;
    expect(state.status).toBe("completed");
    expect(state.depth).toBe(0);
    expect(state.parent).toBeUndefined();
    expect(state.templateSnapshots).toBeUndefined();
    // No exec ever carries a childInstanceId.
    expect(state.executions.every((e) => e.childInstanceId === undefined)).toBe(
      true,
    );
  });
});
