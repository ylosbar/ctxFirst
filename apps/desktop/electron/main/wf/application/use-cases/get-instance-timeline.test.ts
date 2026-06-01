import { describe, expect, it } from "vitest";
import { makeGetInstanceTimeline } from "./get-instance-timeline";
import { createEngineState } from "../engine-state";
import {
  asEventId,
  asTemplateId,
  asTemplateVersion,
  asWorkflowId,
} from "../../domain/ids";

describe("getInstanceTimeline use-case", () => {
  it("returns null for an unknown id", async () => {
    const state = createEngineState();
    const get = makeGetInstanceTimeline({ state });
    expect(await get(asWorkflowId("ghost"))).toBeNull();
  });

  it("returns the projected InstanceState for a known id", async () => {
    const state = createEngineState();
    const id = asWorkflowId("wf-1");
    state.apply({
      type: "InstanceStarted",
      eventId: asEventId("e1"),
      at: "2026-01-01T00:00:00.000Z",
      instanceId: id,
      templateId: asTemplateId("tpl"),
      templateVersion: asTemplateVersion("v1"),
      seed: [],
    });
    const get = makeGetInstanceTimeline({ state });
    const out = await get(id);
    expect(out?.id).toBe(id);
    expect(out?.executions).toEqual([]);
  });
});
