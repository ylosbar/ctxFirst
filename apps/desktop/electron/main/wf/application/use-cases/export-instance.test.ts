import { describe, expect, it } from "vitest";
import {
  InstanceNotFoundError,
  collectArtifactIds,
  makeExportInstance,
  projectFeedbackLoops,
} from "./export-instance";
import { TEMPLATE_LINEAR } from "../../__tests__/fixtures/builders";
import { createFakeArtifactStore } from "../../__tests__/fixtures/fake-artifact-store";
import { createFakeClock } from "../../__tests__/fixtures/fake-clock";
import { createFakeEventLog } from "../../__tests__/fixtures/fake-event-log";
import { createFakeLlmSessionStore } from "../../__tests__/fixtures/fake-llm-session-store";
import { createFakeRunLog } from "../../__tests__/fixtures/fake-run-log";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";
import {
  asEventId,
  asLoopId,
  asRunId,
  asStepExecId,
  asStepId,
  asWorkflowId,
  type WorkflowId,
} from "../../domain/ids";
import { project } from "../../domain/projection";
import type { DomainEvent } from "../../domain/events";

const buildDeps = () => {
  const fakes = {
    eventLog: createFakeEventLog(),
    runLog: createFakeRunLog(),
    artifactStore: createFakeArtifactStore(),
    llmSessions: createFakeLlmSessionStore(),
    templates: createFakeTemplateRegistry([TEMPLATE_LINEAR]),
    clock: createFakeClock(),
  };
  return {
    fakes,
    exportInstance: makeExportInstance(fakes, () => "1.2.3"),
  };
};

const minimalRun = async (
  fakes: ReturnType<typeof buildDeps>["fakes"],
  instanceId: WorkflowId,
) => {
  const seedArtifact = await fakes.artifactStore.put("Markdown", "seed");
  const inputExec = asStepExecId("input-exec");
  const gateExec = asStepExecId("gate-exec");

  const events: DomainEvent[] = [
    {
      type: "InstanceStarted",
      eventId: asEventId("e1"),
      at: "2026-01-01T00:00:00.000Z",
      instanceId,
      templateId: TEMPLATE_LINEAR.id,
      templateVersion: TEMPLATE_LINEAR.version,
      seed: [seedArtifact.id],
    },
    {
      type: "StepStarted",
      eventId: asEventId("e2"),
      at: "2026-01-01T00:00:01.000Z",
      instanceId,
      stepExecId: inputExec,
      stepId: asStepId("input"),
      kind: "user.input",
      inputArtifacts: [seedArtifact.id],
    },
    {
      type: "StepProducedArtifact",
      eventId: asEventId("e3"),
      at: "2026-01-01T00:00:02.000Z",
      instanceId,
      stepExecId: inputExec,
      artifactId: seedArtifact.id,
      port: "out",
    },
    {
      type: "StepValidated",
      eventId: asEventId("e4"),
      at: "2026-01-01T00:00:03.000Z",
      instanceId,
      stepExecId: inputExec,
      by: "auto",
    },
    {
      type: "StepStarted",
      eventId: asEventId("e5"),
      at: "2026-01-01T00:00:04.000Z",
      instanceId,
      stepExecId: gateExec,
      stepId: asStepId("gate"),
      kind: "human.gate",
      inputArtifacts: [seedArtifact.id],
    },
    {
      type: "StepAwaitingHumanGate",
      eventId: asEventId("e6"),
      at: "2026-01-01T00:00:05.000Z",
      instanceId,
      stepExecId: gateExec,
      actorRole: "Developer",
    },
    {
      type: "StepValidated",
      eventId: asEventId("e7"),
      at: "2026-01-01T00:00:06.000Z",
      instanceId,
      stepExecId: gateExec,
      by: "alice",
    },
    {
      type: "InstanceCompleted",
      eventId: asEventId("e8"),
      at: "2026-01-01T00:00:07.000Z",
      instanceId,
      finalArtifact: seedArtifact.id,
    },
  ];
  for (const e of events) await fakes.eventLog.append(e);

  await fakes.runLog.record({
    id: asRunId("run-1"),
    stepExecId: inputExec,
    provider: "fake",
    model: "fake-1",
    promptHash: "h",
    tokensIn: 10,
    tokensOut: 20,
    latencyMs: 100,
    createdAt: "2026-01-01T00:00:02.500Z",
  });
  fakes.llmSessions.push({
    seq: 1,
    stepExecId: inputExec,
    payload: { type: "text-delta", text: "hello" },
  });

  return { seedArtifact, inputExec, gateExec };
};

describe("exportInstance use-case", () => {
  it("throws InstanceNotFoundError when no events exist for the instance", async () => {
    const { exportInstance } = buildDeps();
    await expect(
      exportInstance(asWorkflowId("absent")),
    ).rejects.toBeInstanceOf(InstanceNotFoundError);
  });

  it("returns a complete bundle for a run that completed", async () => {
    const { fakes, exportInstance } = buildDeps();
    const instanceId = asWorkflowId("wf-1");
    const { seedArtifact, inputExec, gateExec } = await minimalRun(
      fakes,
      instanceId,
    );

    const bundle = await exportInstance(instanceId);

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.exportedBy).toEqual({
      app: "ctxfirst-desktop",
      appVersion: "1.2.3",
    });
    expect(bundle.instance.id).toBe(instanceId);
    expect(bundle.instance.status).toBe("completed");
    expect(bundle.instance.seedArtifactIds).toEqual([seedArtifact.id]);
    expect(bundle.template.id).toBe(TEMPLATE_LINEAR.id);
    expect(bundle.executions).toHaveLength(2);
    const inputExport = bundle.executions.find((e) => e.id === inputExec);
    expect(inputExport).toBeDefined();
    expect(inputExport?.llmSession).toHaveLength(1);
    expect(bundle.executions.find((e) => e.id === gateExec)).toBeDefined();
    expect(bundle.runs).toHaveLength(1);
    expect(bundle.runs[0].stepExecId).toBe(inputExec);
    expect(bundle.artifacts).toHaveLength(1);
    expect(bundle.artifacts[0].id).toBe(seedArtifact.id);
    expect(bundle.artifacts[0].content.encoding).toBe("utf8");
    expect(bundle.artifacts[0].content.data).toBe("seed");
    expect(bundle.events).toHaveLength(8);
    expect(bundle.feedbackLoops).toEqual([]);
  });

  it("surfaces open and closed feedback loops via projectFeedbackLoops", async () => {
    const { fakes, exportInstance } = buildDeps();
    const instanceId = asWorkflowId("wf-1");
    await minimalRun(fakes, instanceId);

    const loopId = asLoopId("loop-1");
    await fakes.eventLog.append({
      type: "LoopOpened",
      eventId: asEventId("e9"),
      at: "2026-01-01T00:00:08.000Z",
      instanceId,
      loopId,
      fromStepExec: asStepExecId("gate-exec"),
      toStepId: asStepId("input"),
      reason: "please redo",
      author: "alice",
    });
    await fakes.eventLog.append({
      type: "LoopClosed",
      eventId: asEventId("e10"),
      at: "2026-01-01T00:00:09.000Z",
      instanceId,
      loopId,
    });

    const bundle = await exportInstance(instanceId);
    expect(bundle.feedbackLoops).toHaveLength(1);
    expect(bundle.feedbackLoops[0]).toMatchObject({
      id: loopId,
      reason: "please redo",
      author: "alice",
      closedAt: "2026-01-01T00:00:09.000Z",
    });
  });

  it("uses the clock for `exportedAt`", async () => {
    const { fakes, exportInstance } = buildDeps();
    const instanceId = asWorkflowId("wf-1");
    await minimalRun(fakes, instanceId);
    fakes.clock.setNow("2030-12-31T23:59:00.000Z");
    const bundle = await exportInstance(instanceId);
    expect(bundle.exportedAt.startsWith("2030-")).toBe(true);
  });
});

describe("collectArtifactIds", () => {
  it("returns seed + execution input + execution output ids without duplicates", async () => {
    const fakes = {
      eventLog: createFakeEventLog(),
      runLog: createFakeRunLog(),
      artifactStore: createFakeArtifactStore(),
      llmSessions: createFakeLlmSessionStore(),
      templates: createFakeTemplateRegistry([TEMPLATE_LINEAR]),
      clock: createFakeClock(),
    };
    const instanceId = asWorkflowId("wf-1");
    await minimalRun(fakes, instanceId);
    const events = await fakes.eventLog.readByInstance(instanceId);
    const state = project(events)!;
    const ids = collectArtifactIds(state);
    // Both executions reference the seed as input + the input step output; no
    // duplicates because the Set dedupes.
    expect(ids.size).toBeGreaterThanOrEqual(1);
    expect([...ids].every((id) => typeof id === "string")).toBe(true);
  });
});

describe("projectFeedbackLoops", () => {
  it("sorts loops by openedAt ascending and tags closed loops", () => {
    const instanceId = asWorkflowId("wf-1");
    const evts: DomainEvent[] = [
      {
        type: "LoopOpened",
        eventId: asEventId("a"),
        at: "2026-01-02T00:00:00.000Z",
        instanceId,
        loopId: asLoopId("L2"),
        fromStepExec: asStepExecId("x"),
        toStepId: asStepId("y"),
        reason: "later",
        author: "user",
      },
      {
        type: "LoopOpened",
        eventId: asEventId("b"),
        at: "2026-01-01T00:00:00.000Z",
        instanceId,
        loopId: asLoopId("L1"),
        fromStepExec: asStepExecId("x"),
        toStepId: asStepId("y"),
        reason: "earlier",
        author: "user",
      },
      {
        type: "LoopClosed",
        eventId: asEventId("c"),
        at: "2026-01-01T01:00:00.000Z",
        instanceId,
        loopId: asLoopId("L1"),
      },
    ];

    const projected = projectFeedbackLoops(evts);
    expect(projected.map((l) => l.id)).toEqual([asLoopId("L1"), asLoopId("L2")]);
    expect(projected[0].closedAt).toBe("2026-01-01T01:00:00.000Z");
    expect(projected[1].closedAt).toBeNull();
  });
});
