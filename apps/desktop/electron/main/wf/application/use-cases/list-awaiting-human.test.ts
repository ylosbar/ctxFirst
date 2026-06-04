import { describe, expect, it } from "vitest";
import { makeListAwaitingHuman } from "./list-awaiting-human";
import { TEMPLATE_LINEAR } from "../../__tests__/fixtures/builders";
import { createFakeChannelContext } from "../../__tests__/fixtures/fake-channel-context";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";
import { createEngineState } from "../engine-state";
import {
  asArtifactId,
  asEventId,
  asStepExecId,
  asStepId,
  asWorkflowId,
} from "../../domain/ids";
import type { DomainEvent } from "../../domain/events";

const seedAwaiting = (
  state: ReturnType<typeof createEngineState>,
  id: string,
  awaitingAt: string,
  channelId: string,
) => {
  const instanceId = asWorkflowId(id);
  const inputExec = asStepExecId(`${id}-input`);
  const gateExec = asStepExecId(`${id}-gate`);
  const artifact = asArtifactId(`${id}-a1`);
  const events: DomainEvent[] = [
    {
      type: "InstanceStarted",
      eventId: asEventId(`${id}-e1`),
      at: awaitingAt,
      instanceId,
      templateId: TEMPLATE_LINEAR.id,
      templateVersion: TEMPLATE_LINEAR.version,
      seed: [artifact],
      channelId,
    },
    {
      type: "StepStarted",
      eventId: asEventId(`${id}-e2`),
      at: awaitingAt,
      instanceId,
      stepExecId: inputExec,
      stepId: asStepId("input"),
      kind: "user.input",
      inputArtifacts: [artifact],
    },
    {
      type: "StepProducedArtifact",
      eventId: asEventId(`${id}-e3`),
      at: awaitingAt,
      instanceId,
      stepExecId: inputExec,
      artifactId: artifact,
      port: "out",
    },
    {
      type: "StepValidated",
      eventId: asEventId(`${id}-e4`),
      at: awaitingAt,
      instanceId,
      stepExecId: inputExec,
      by: "auto",
    },
    {
      type: "StepStarted",
      eventId: asEventId(`${id}-e5`),
      at: awaitingAt,
      instanceId,
      stepExecId: gateExec,
      stepId: asStepId("gate"),
      kind: "human.gate",
      inputArtifacts: [artifact],
    },
    {
      type: "StepAwaitingHumanGate",
      eventId: asEventId(`${id}-e6`),
      at: awaitingAt,
      instanceId,
      stepExecId: gateExec,
      actorRole: "Developer",
    },
  ];
  for (const e of events) state.apply(e);
  return { instanceId, gateExec };
};

describe("listAwaitingHuman use-case", () => {
  it("returns awaiting rows sorted by awaitingSince ascending (oldest first)", async () => {
    const state = createEngineState();
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const channels = createFakeChannelContext("default");
    seedAwaiting(state, "wf-old", "2026-01-01T00:00:00.000Z", "default");
    seedAwaiting(state, "wf-new", "2026-02-01T00:00:00.000Z", "default");

    const list = makeListAwaitingHuman({ state, templates, channels });
    const rows = await list();
    expect(rows.map((r) => r.instanceId)).toEqual([
      asWorkflowId("wf-old"),
      asWorkflowId("wf-new"),
    ]);
    expect(rows[0].stepId).toBe(asStepId("gate"));
    expect(rows[0].actorRole).toBe("Developer");
    expect(rows[0].outputArtifactId).toBe(asArtifactId("wf-old-a1"));
  });

  it("filters out instances pinned to a different channel", async () => {
    const state = createEngineState();
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const channels = createFakeChannelContext("default");
    seedAwaiting(state, "wf-1", "2026-01-01T00:00:00.000Z", "default");
    seedAwaiting(state, "wf-2", "2026-01-01T00:00:00.000Z", "other");

    const list = makeListAwaitingHuman({ state, templates, channels });
    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0].instanceId).toBe(asWorkflowId("wf-1"));
  });

  it("skips instances whose template cannot be resolved", async () => {
    const state = createEngineState();
    const templates = createFakeTemplateRegistry();
    const channels = createFakeChannelContext("default");
    seedAwaiting(state, "wf-1", "2026-01-01T00:00:00.000Z", "default");

    const list = makeListAwaitingHuman({ state, templates, channels });
    expect(await list()).toEqual([]);
  });

  it("does NOT surface a step that is awaitingChild (it is a sub-workflow wait, not a human gate)", async () => {
    // sub-template-invoke.md §6: a `template.invoke` step parks in `awaitingChild`
    // while its child runs. That is not human-actionable on the parent — any
    // human gate lives on the *child* instance — so the parent must stay out of
    // the human inbox.
    const state = createEngineState();
    const templates = createFakeTemplateRegistry([TEMPLATE_LINEAR]);
    const channels = createFakeChannelContext("default");

    const instanceId = asWorkflowId("wf-invoke");
    const invokeExec = asStepExecId("wf-invoke-inv");
    const at = "2026-01-01T00:00:00.000Z";
    const events: DomainEvent[] = [
      {
        type: "InstanceStarted",
        eventId: asEventId("wf-invoke-e1"),
        at,
        instanceId,
        templateId: TEMPLATE_LINEAR.id,
        templateVersion: TEMPLATE_LINEAR.version,
        seed: [],
        channelId: "default",
        depth: 0,
      },
      {
        type: "StepStarted",
        eventId: asEventId("wf-invoke-e2"),
        at,
        instanceId,
        stepExecId: invokeExec,
        stepId: asStepId("inv"),
        kind: "template.invoke",
        inputArtifacts: [],
      },
      {
        type: "ChildInstanceSpawned",
        eventId: asEventId("wf-invoke-e3"),
        at,
        instanceId,
        stepExecId: invokeExec,
        childInstanceId: asWorkflowId("wf-child"),
        childTemplateId: TEMPLATE_LINEAR.id,
        childTemplateVersion: TEMPLATE_LINEAR.version,
        seedBindings: [],
      },
    ];
    for (const e of events) state.apply(e);

    const list = makeListAwaitingHuman({ state, templates, channels });
    expect(await list()).toEqual([]);
  });
});
