import { describe, expect, it } from "vitest";
import { makeListInstances } from "./list-instances";
import { createFakeChannelContext } from "../../__tests__/fixtures/fake-channel-context";
import { createEngineState } from "../engine-state";
import {
  asEventId,
  asTemplateId,
  asTemplateVersion,
  asWorkflowId,
} from "../../domain/ids";

const seedInstance = (
  state: ReturnType<typeof createEngineState>,
  id: string,
  channelId?: string,
) => {
  state.apply({
    type: "InstanceStarted",
    eventId: asEventId(`evt-${id}`),
    at: "2026-01-01T00:00:00.000Z",
    instanceId: asWorkflowId(id),
    templateId: asTemplateId("tpl"),
    templateVersion: asTemplateVersion("v1"),
    seed: [],
    channelId,
  });
};

describe("listInstances use-case", () => {
  it("returns the summaries for the active channel only", async () => {
    const state = createEngineState();
    const channels = createFakeChannelContext("default");
    seedInstance(state, "wf-1", "default");
    seedInstance(state, "wf-2", "other");

    const list = makeListInstances({ state, channels });
    const rows = await list();
    expect(rows.map((r) => r.id)).toEqual([asWorkflowId("wf-1")]);
  });
});
