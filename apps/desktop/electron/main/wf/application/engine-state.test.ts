import { describe, expect, it } from "vitest";
import { createEngineState, rehydrateFromEventLog } from "./engine-state";
import {
  asArtifactId,
  asEventId,
  asLoopId,
  asStepExecId,
  asStepId,
  asTemplateId,
  asTemplateVersion,
  asWorkflowId,
  type WorkflowId,
} from "../domain/ids";
import { project } from "../domain/projection";
import type { DomainEvent } from "../domain/events";
import { createFakeEventLog } from "../__tests__/fixtures/fake-event-log";

const TPL = asTemplateId("tpl");
const VER = asTemplateVersion("v1");

const buildEvents = (
  instanceId: WorkflowId,
  opts: {
    seq?: number;
    channelId?: string;
    startAt?: string;
    completed?: boolean;
  } = {},
): DomainEvent[] => {
  const seq = opts.seq ?? 1;
  const startAt = opts.startAt ?? `2026-01-01T00:00:0${seq}.000Z`;
  const exec = asStepExecId(`exec-${seq}-1`);
  const artifact = asArtifactId(`artifact-${seq}-1`);
  const evts: DomainEvent[] = [
    {
      type: "InstanceStarted",
      eventId: asEventId(`evt-${seq}-1`),
      at: startAt,
      instanceId,
      templateId: TPL,
      templateVersion: VER,
      seed: [],
      channelId: opts.channelId,
    },
    {
      type: "StepStarted",
      eventId: asEventId(`evt-${seq}-2`),
      at: `2026-01-01T00:00:0${seq}.100Z`,
      instanceId,
      stepExecId: exec,
      stepId: asStepId("s1"),
      kind: "user.input",
      inputArtifacts: [],
    },
    {
      type: "StepProducedArtifact",
      eventId: asEventId(`evt-${seq}-3`),
      at: `2026-01-01T00:00:0${seq}.200Z`,
      instanceId,
      stepExecId: exec,
      artifactId: artifact,
      port: "out",
    },
    {
      type: "StepValidated",
      eventId: asEventId(`evt-${seq}-4`),
      at: `2026-01-01T00:00:0${seq}.300Z`,
      instanceId,
      stepExecId: exec,
      by: "auto",
    },
  ];
  if (opts.completed) {
    evts.push({
      type: "InstanceCompleted",
      eventId: asEventId(`evt-${seq}-5`),
      at: `2026-01-01T00:00:0${seq}.400Z`,
      instanceId,
      finalArtifact: artifact,
    });
  }
  return evts;
};

describe("EngineState — apply / getInstance", () => {
  it("returns null for an unknown instance", () => {
    const state = createEngineState();
    expect(state.getInstance(asWorkflowId("absent"))).toBeNull();
  });

  it("ignores events without an instanceId", () => {
    const state = createEngineState();
    // Defensive guard: a future variant lacking instanceId must not crash.
    const malformed = { type: "InstanceStarted", eventId: asEventId("e"), at: "x" } as unknown as DomainEvent;
    state.apply(malformed);
    expect(state.listInstanceIds()).toEqual([]);
  });

  it("builds a projection incrementally that matches a full replay", () => {
    const state = createEngineState();
    const id = asWorkflowId("wf-1");
    const evts = buildEvents(id, { completed: true });
    for (const e of evts) state.apply(e);

    const incremental = state.getInstance(id);
    const replayed = project(evts);
    expect(replayed).not.toBeNull();
    expect(incremental).not.toBeNull();
    expect(incremental?.status).toBe(replayed?.status);
    expect(incremental?.executions.length).toBe(replayed?.executions.length);
    expect(incremental?.executions[0].status).toBe(replayed?.executions[0].status);
    expect(incremental?.executions[0].outputArtifact).toBe(
      replayed?.executions[0].outputArtifact,
    );
  });

  it("eventsFor returns the events for an instance in apply order", () => {
    const state = createEngineState();
    const id = asWorkflowId("wf-1");
    const evts = buildEvents(id);
    for (const e of evts) state.apply(e);

    const recorded = state.eventsFor(id);
    expect(recorded.map((e) => e.eventId)).toEqual(evts.map((e) => e.eventId));
  });

  it("eventsFor returns an empty list for an unknown instance", () => {
    const state = createEngineState();
    expect(state.eventsFor(asWorkflowId("absent"))).toEqual([]);
  });
});

describe("EngineState — listInstanceIds", () => {
  it("returns instance ids in first-seen order", () => {
    const state = createEngineState();
    const a = asWorkflowId("wf-A");
    const b = asWorkflowId("wf-B");
    const c = asWorkflowId("wf-C");
    for (const e of buildEvents(a, { seq: 1 })) state.apply(e);
    for (const e of buildEvents(b, { seq: 2 })) state.apply(e);
    for (const e of buildEvents(c, { seq: 3 })) state.apply(e);

    expect(state.listInstanceIds()).toEqual([a, b, c]);
  });

  it("filters by channelId when provided", () => {
    const state = createEngineState();
    const a = asWorkflowId("wf-A");
    const b = asWorkflowId("wf-B");
    const c = asWorkflowId("wf-C");
    for (const e of buildEvents(a, { seq: 1, channelId: "ch-1" })) state.apply(e);
    for (const e of buildEvents(b, { seq: 2, channelId: "ch-2" })) state.apply(e);
    for (const e of buildEvents(c, { seq: 3, channelId: "ch-1" })) state.apply(e);

    expect(state.listInstanceIds("ch-1")).toEqual([a, c]);
    expect(state.listInstanceIds("ch-2")).toEqual([b]);
    expect(state.listInstanceIds("nope")).toEqual([]);
  });
});

describe("EngineState — listInstances", () => {
  it("sorts summaries by updatedAt descending (latest event wins)", () => {
    const state = createEngineState();
    const older = asWorkflowId("wf-older");
    const newer = asWorkflowId("wf-newer");
    for (const e of buildEvents(older, { seq: 1, startAt: "2026-01-01T00:00:01.000Z" })) {
      state.apply(e);
    }
    for (const e of buildEvents(newer, { seq: 5, startAt: "2026-01-05T00:00:00.000Z" })) {
      state.apply(e);
    }

    const rows = state.listInstances();
    expect(rows.map((r) => r.id)).toEqual([newer, older]);
  });

  it("filters by channelId when provided", () => {
    const state = createEngineState();
    const a = asWorkflowId("wf-A");
    const b = asWorkflowId("wf-B");
    for (const e of buildEvents(a, { seq: 1, channelId: "ch-keep" })) state.apply(e);
    for (const e of buildEvents(b, { seq: 2, channelId: "ch-drop" })) state.apply(e);

    expect(state.listInstances("ch-keep").map((r) => r.id)).toEqual([a]);
    expect(state.listInstances("ch-drop").map((r) => r.id)).toEqual([b]);
  });

  it("uses the last event timestamp as updatedAt", () => {
    const state = createEngineState();
    const id = asWorkflowId("wf-1");
    const evts = buildEvents(id, { completed: true });
    for (const e of evts) state.apply(e);

    const row = state.listInstances()[0];
    expect(row.updatedAt).toBe(evts[evts.length - 1].at);
  });
});

describe("EngineState — removeInstance", () => {
  it("evicts events, scratch and cache for the instance", () => {
    const state = createEngineState();
    const id = asWorkflowId("wf-1");
    for (const e of buildEvents(id, { completed: true })) state.apply(e);

    expect(state.getInstance(id)).not.toBeNull();
    state.removeInstance(id);

    expect(state.getInstance(id)).toBeNull();
    expect(state.eventsFor(id)).toEqual([]);
    expect(state.listInstanceIds()).not.toContain(id);
    expect(state.listInstances().find((r) => r.id === id)).toBeUndefined();
  });

  it("is idempotent on an unknown instance", () => {
    const state = createEngineState();
    expect(() => state.removeInstance(asWorkflowId("ghost"))).not.toThrow();
  });
});

describe("EngineState — projection edge cases", () => {
  it("getInstance is null until InstanceStarted is applied", () => {
    const state = createEngineState();
    const id = asWorkflowId("wf-1");
    // A StepStarted without a prior InstanceStarted has nothing to finalize.
    state.apply({
      type: "StepStarted",
      eventId: asEventId("e1"),
      at: "2026-01-01T00:00:00.000Z",
      instanceId: id,
      stepExecId: asStepExecId("x"),
      stepId: asStepId("s"),
      kind: "user.input",
      inputArtifacts: [],
    });
    expect(state.getInstance(id)).toBeNull();
    // listInstanceIds still records the id (first-seen), even with no projection.
    expect(state.listInstanceIds()).toContain(id);
  });

  it("tracks open loops and removes them on LoopClosed", () => {
    const state = createEngineState();
    const id = asWorkflowId("wf-1");
    for (const e of buildEvents(id)) state.apply(e);

    const loopId = asLoopId("loop-1");
    state.apply({
      type: "LoopOpened",
      eventId: asEventId("e-loop"),
      at: "2026-01-02T00:00:00.000Z",
      instanceId: id,
      loopId,
      fromStepExec: asStepExecId("exec-1-1"),
      toStepId: asStepId("s1"),
      reason: "redo",
      author: "user",
    });
    expect(state.getInstance(id)?.openLoops).toHaveLength(1);

    state.apply({
      type: "LoopClosed",
      eventId: asEventId("e-loop-close"),
      at: "2026-01-02T00:00:01.000Z",
      instanceId: id,
      loopId,
    });
    expect(state.getInstance(id)?.openLoops).toHaveLength(0);
  });
});

describe("rehydrateFromEventLog", () => {
  it("replays every event from the log so the state matches a fresh project()", async () => {
    const log = createFakeEventLog();
    const a = asWorkflowId("wf-A");
    const b = asWorkflowId("wf-B");
    for (const e of buildEvents(a, { seq: 1, completed: true })) await log.append(e);
    for (const e of buildEvents(b, { seq: 2 })) await log.append(e);

    const state = createEngineState();
    await rehydrateFromEventLog(state, log);

    const expectedA = project(await log.readByInstance(a));
    const expectedB = project(await log.readByInstance(b));
    expect(state.getInstance(a)?.status).toBe(expectedA?.status);
    expect(state.getInstance(b)?.status).toBe(expectedB?.status);
    expect(state.listInstanceIds()).toEqual([a, b]);
  });

  it("is a no-op on an empty log", async () => {
    const log = createFakeEventLog();
    const state = createEngineState();
    await rehydrateFromEventLog(state, log);
    expect(state.listInstanceIds()).toEqual([]);
  });
});
