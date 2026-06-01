import { describe, expect, it } from "vitest";
import { makeOpenFeedbackLoop } from "./open-feedback-loop";
import { buildTemplate, ids } from "../../__tests__/fixtures/builders";
import { createFakeClock } from "../../__tests__/fixtures/fake-clock";
import { createFakeEventBus } from "../../__tests__/fixtures/fake-event-bus";
import { createFakeEventLog } from "../../__tests__/fixtures/fake-event-log";
import { createFakeIdGenerator } from "../../__tests__/fixtures/fake-ids";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";
import { createEngineState } from "../engine-state";
import {
  asArtifactId,
  asEventId,
  asStepExecId,
  asStepId,
  asWorkflowId,
  type StepExecId,
  type WorkflowId,
} from "../../domain/ids";
import type { DomainEvent } from "../../domain/events";

const LOOPABLE_TEMPLATE = buildTemplate(
  "loopable",
  [
    { id: "gen", kind: "claude_code.invoke", humanGateRequired: false },
    { id: "gate", kind: "human.gate", humanGateRequired: true },
  ],
  [
    { from: "gen", to: "gate" },
    { from: "gate", to: "gen", isLoop: true },
  ],
  { id: "loopable", version: "v1", exitSteps: ["gate"] },
);

const seedRunningInstance = (
  state: ReturnType<typeof createEngineState>,
  instanceId: WorkflowId,
  gateExecId: StepExecId = asStepExecId("gate-exec-1"),
): void => {
  const events: DomainEvent[] = [
    {
      type: "InstanceStarted",
      eventId: asEventId("e1"),
      at: "2026-01-01T00:00:00.000Z",
      instanceId,
      templateId: LOOPABLE_TEMPLATE.id,
      templateVersion: LOOPABLE_TEMPLATE.version,
      seed: [],
    },
    {
      type: "StepStarted",
      eventId: asEventId("e2"),
      at: "2026-01-01T00:00:01.000Z",
      instanceId,
      stepExecId: asStepExecId("gen-exec-1"),
      stepId: asStepId("gen"),
      kind: "claude_code.invoke",
      inputArtifacts: [],
    },
    {
      type: "StepProducedArtifact",
      eventId: asEventId("e3"),
      at: "2026-01-01T00:00:02.000Z",
      instanceId,
      stepExecId: asStepExecId("gen-exec-1"),
      artifactId: asArtifactId("a1"),
      port: "out",
    },
    {
      type: "StepValidated",
      eventId: asEventId("e4"),
      at: "2026-01-01T00:00:03.000Z",
      instanceId,
      stepExecId: asStepExecId("gen-exec-1"),
      by: "auto",
    },
    {
      type: "StepStarted",
      eventId: asEventId("e5"),
      at: "2026-01-01T00:00:04.000Z",
      instanceId,
      stepExecId: gateExecId,
      stepId: asStepId("gate"),
      kind: "human.gate",
      inputArtifacts: [asArtifactId("a1")],
    },
    {
      type: "StepAwaitingHumanGate",
      eventId: asEventId("e6"),
      at: "2026-01-01T00:00:05.000Z",
      instanceId,
      stepExecId: gateExecId,
      actorRole: "Developer",
    },
  ];
  for (const e of events) state.apply(e);
};

const buildDeps = () => {
  const state = createEngineState();
  const fakes = {
    bus: createFakeEventBus(),
    log: createFakeEventLog(),
    clock: createFakeClock(),
    ids: createFakeIdGenerator(),
    templates: createFakeTemplateRegistry([LOOPABLE_TEMPLATE]),
    state,
  };
  return { fakes, state, openLoop: makeOpenFeedbackLoop(fakes) };
};

describe("openFeedbackLoop use-case", () => {
  it("emits LoopOpened with the right metadata for an authorized loop", async () => {
    const { fakes, state, openLoop } = buildDeps();
    const instanceId = asWorkflowId("wf-1");
    const gateExec = asStepExecId("gate-exec-1");
    seedRunningInstance(state, instanceId, gateExec);

    await openLoop({
      instanceId,
      stepExecId: gateExec,
      toStepId: asStepId("gen"),
      reason: "please add more detail",
      author: "alice",
    });

    expect(fakes.bus.ofType("LoopOpened")).toHaveLength(1);
    const evt = fakes.bus.ofType("LoopOpened")[0];
    expect(evt.instanceId).toBe(instanceId);
    expect(evt.fromStepExec).toBe(gateExec);
    expect(evt.toStepId).toBe("gen");
    expect(evt.reason).toBe("please add more detail");
    expect(evt.author).toBe("alice");
    expect(evt.loopId).toMatch(/^id-/);
  });

  it("defaults the author to 'user' when omitted", async () => {
    const { fakes, state, openLoop } = buildDeps();
    const instanceId = asWorkflowId("wf-1");
    const gateExec = asStepExecId("gate-exec-1");
    seedRunningInstance(state, instanceId, gateExec);

    await openLoop({
      instanceId,
      stepExecId: gateExec,
      toStepId: asStepId("gen"),
      reason: "fix",
    });

    expect(fakes.bus.ofType("LoopOpened")[0].author).toBe("user");
  });

  it("throws when the instance is unknown", async () => {
    const { fakes, openLoop } = buildDeps();
    await expect(
      openLoop({
        instanceId: asWorkflowId("nope"),
        stepExecId: asStepExecId("ex"),
        toStepId: asStepId("gen"),
        reason: "x",
      }),
    ).rejects.toThrow(/unknown instance nope/);
    expect(fakes.bus.published).toHaveLength(0);
  });

  it("throws when the stepExecId is unknown on the instance", async () => {
    const { fakes, state, openLoop } = buildDeps();
    const instanceId = asWorkflowId("wf-1");
    seedRunningInstance(state, instanceId);

    await expect(
      openLoop({
        instanceId,
        stepExecId: asStepExecId("ghost-exec"),
        toStepId: asStepId("gen"),
        reason: "x",
      }),
    ).rejects.toThrow(/unknown stepExec/);
    expect(fakes.bus.published).toHaveLength(0);
  });

  it("throws when the template does not declare the loop edge", async () => {
    const { fakes, state, openLoop } = buildDeps();
    const instanceId = asWorkflowId("wf-1");
    const gateExec = asStepExecId("gate-exec-1");
    seedRunningInstance(state, instanceId, gateExec);

    await expect(
      openLoop({
        instanceId,
        stepExecId: gateExec,
        toStepId: asStepId("gate"),
        reason: "self-loop not allowed",
      }),
    ).rejects.toThrow(/not permitted/);
    expect(fakes.bus.published).toHaveLength(0);
  });

  it("forwards comments verbatim", async () => {
    const { fakes, state, openLoop } = buildDeps();
    const instanceId = asWorkflowId("wf-1");
    const gateExec = asStepExecId("gate-exec-1");
    seedRunningInstance(state, instanceId, gateExec);

    const comments = [
      { anchor: { startLine: 1, endLine: 2 }, body: "fix this" },
    ];
    await openLoop({
      instanceId,
      stepExecId: gateExec,
      toStepId: asStepId("gen"),
      reason: "review",
      comments,
    });

    expect(fakes.bus.ofType("LoopOpened")[0].comments).toEqual(comments);
  });

  it("appends to the log before publishing on the bus", async () => {
    const { fakes, state, openLoop } = buildDeps();
    const instanceId = asWorkflowId("wf-1");
    const gateExec = asStepExecId("gate-exec-1");
    seedRunningInstance(state, instanceId, gateExec);

    const order: string[] = [];
    const origAppend = fakes.log.append;
    fakes.log.append = async (e) => {
      order.push("append");
      return origAppend(e);
    };
    fakes.bus.subscribe(() => {
      order.push("publish");
    });
    await openLoop({
      instanceId,
      stepExecId: gateExec,
      toStepId: ids.step("gen"),
      reason: "x",
    });
    expect(order).toEqual(["append", "publish"]);
  });
});
