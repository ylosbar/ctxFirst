import { describe, expect, it } from "vitest";
import { makeSearchInstances } from "./search-instances";
import { createFakeChannelContext } from "../../__tests__/fixtures/fake-channel-context";
import { createFakeEventLog } from "../../__tests__/fixtures/fake-event-log";
import { createEngineState } from "../engine-state";
import {
  asEventId,
  asTemplateId,
  asTemplateVersion,
  asWorkflowId,
} from "../../domain/ids";
import type { DomainEvent } from "../../domain/events";

const seedInstance = async (
  state: ReturnType<typeof createEngineState>,
  log: ReturnType<typeof createFakeEventLog>,
  id: string,
  channelId: string,
  at: string,
) => {
  const evt: DomainEvent = {
    type: "InstanceStarted",
    eventId: asEventId(`evt-${id}`),
    at,
    instanceId: asWorkflowId(id),
    templateId: asTemplateId(`tpl-${id}`),
    templateVersion: asTemplateVersion("v1"),
    seed: [],
    channelId,
  };
  await log.append(evt);
  state.apply(evt);
};

describe("searchInstances use-case", () => {
  it("returns all instances of the active channel when the query is empty", async () => {
    const log = createFakeEventLog();
    const state = createEngineState();
    const channels = createFakeChannelContext("default");
    await seedInstance(state, log, "wf-1", "default", "2026-01-01T00:00:00.000Z");
    await seedInstance(state, log, "wf-2", "default", "2026-01-02T00:00:00.000Z");
    await seedInstance(state, log, "wf-3", "other", "2026-01-03T00:00:00.000Z");

    const search = makeSearchInstances({ state, log, channels });
    const out = await search("   ");
    expect(out.map((r) => r.id).sort()).toEqual(
      [asWorkflowId("wf-1"), asWorkflowId("wf-2")].sort(),
    );
  });

  it("filters by free-text query and skips instances outside the active channel", async () => {
    const log = createFakeEventLog();
    const state = createEngineState();
    const channels = createFakeChannelContext("default");
    await seedInstance(state, log, "wf-target", "default", "2026-01-01T00:00:00.000Z");
    await seedInstance(state, log, "wf-other", "default", "2026-01-02T00:00:00.000Z");
    await seedInstance(state, log, "wf-target-x", "other", "2026-01-03T00:00:00.000Z");

    const search = makeSearchInstances({ state, log, channels });
    const out = await search("target");
    // Both wf-target and wf-target-x match the query but only the one in the
    // active channel is returned.
    expect(out.map((r) => r.id)).toEqual([asWorkflowId("wf-target")]);
  });

  it("sorts results by updatedAt desc", async () => {
    const log = createFakeEventLog();
    const state = createEngineState();
    const channels = createFakeChannelContext("default");
    await seedInstance(state, log, "old", "default", "2026-01-01T00:00:00.000Z");
    await seedInstance(state, log, "new", "default", "2026-01-05T00:00:00.000Z");

    const search = makeSearchInstances({ state, log, channels });
    const out = await search("");
    expect(out.map((r) => r.id)).toEqual([
      asWorkflowId("new"),
      asWorkflowId("old"),
    ]);
  });
});
