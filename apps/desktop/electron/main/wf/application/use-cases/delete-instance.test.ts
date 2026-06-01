import { describe, expect, it } from "vitest";
import { makeDeleteInstance } from "./delete-instance";
import { createFakeEventLog } from "../../__tests__/fixtures/fake-event-log";
import { createEngineState } from "../engine-state";
import {
  asEventId,
  asStepExecId,
  asStepId,
  asTemplateId,
  asTemplateVersion,
  asWorkflowId,
} from "../../domain/ids";

const buildDeps = () => {
  const log = createFakeEventLog();
  const state = createEngineState();
  return { log, state, remove: makeDeleteInstance({ log, state }) };
};

describe("deleteInstance use-case", () => {
  it("purges events and the in-memory projection", async () => {
    const { log, state, remove } = buildDeps();
    const id = asWorkflowId("wf-1");
    const started = {
      type: "InstanceStarted" as const,
      eventId: asEventId("e1"),
      at: "2026-01-01T00:00:00.000Z",
      instanceId: id,
      templateId: asTemplateId("tpl"),
      templateVersion: asTemplateVersion("v1"),
      seed: [],
    };
    const stepStarted = {
      type: "StepStarted" as const,
      eventId: asEventId("e2"),
      at: "2026-01-01T00:00:01.000Z",
      instanceId: id,
      stepExecId: asStepExecId("exec-1"),
      stepId: asStepId("s1"),
      kind: "user.input",
      inputArtifacts: [],
    };
    await log.append(started);
    await log.append(stepStarted);
    state.apply(started);
    state.apply(stepStarted);
    expect(state.getInstance(id)).not.toBeNull();

    await remove(id);

    expect(state.getInstance(id)).toBeNull();
    expect(await log.readByInstance(id)).toHaveLength(0);
  });

  it("is idempotent on an absent instance", async () => {
    const { remove } = buildDeps();
    await expect(remove(asWorkflowId("ghost"))).resolves.toBeUndefined();
  });
});
