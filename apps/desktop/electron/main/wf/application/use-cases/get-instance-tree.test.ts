import { describe, expect, it } from "vitest";
import { makeGetInstanceTree } from "./get-instance-tree";
import { createEngineState } from "../engine-state";
import {
  asEventId,
  asStepExecId,
  asTemplateId,
  asTemplateVersion,
  asWorkflowId,
} from "../../domain/ids";

const seedInstance = (
  state: ReturnType<typeof createEngineState>,
  id: string,
  opts: {
    channelId?: string;
    parent?: { instanceId: string; stepExecId: string };
  } = {},
) => {
  state.apply({
    type: "InstanceStarted",
    eventId: asEventId(`evt-${id}`),
    at: "2026-01-01T00:00:00.000Z",
    instanceId: asWorkflowId(id),
    templateId: asTemplateId("tpl"),
    templateVersion: asTemplateVersion("v1"),
    seed: [],
    channelId: opts.channelId ?? "default",
    parent: opts.parent
      ? {
          instanceId: asWorkflowId(opts.parent.instanceId),
          stepExecId: asStepExecId(opts.parent.stepExecId),
        }
      : undefined,
  });
};

describe("getInstanceTree use-case", () => {
  it("returns null for an unknown instance", async () => {
    const state = createEngineState();
    const tree = makeGetInstanceTree({ state });
    expect(await tree(asWorkflowId("nope"))).toBeNull();
  });

  it("returns a leaf node (root with no children)", async () => {
    const state = createEngineState();
    seedInstance(state, "root");
    const tree = makeGetInstanceTree({ state });

    const node = await tree(asWorkflowId("root"));
    expect(node?.instance.id).toBe(asWorkflowId("root"));
    expect(node?.children).toEqual([]);
  });

  it("nests children under their parent recursively", async () => {
    const state = createEngineState();
    seedInstance(state, "root");
    seedInstance(state, "childA", {
      parent: { instanceId: "root", stepExecId: "exec-a" },
    });
    seedInstance(state, "childB", {
      parent: { instanceId: "root", stepExecId: "exec-b" },
    });
    seedInstance(state, "grandchild", {
      parent: { instanceId: "childA", stepExecId: "exec-c" },
    });

    const tree = makeGetInstanceTree({ state });
    const node = await tree(asWorkflowId("root"));

    expect(node?.children.map((c) => c.instance.id)).toEqual([
      asWorkflowId("childA"),
      asWorkflowId("childB"),
    ]);
    const childA = node?.children.find(
      (c) => c.instance.id === asWorkflowId("childA"),
    );
    expect(childA?.children.map((c) => c.instance.id)).toEqual([
      asWorkflowId("grandchild"),
    ]);
    expect(childA?.instance.parent?.instanceId).toBe(asWorkflowId("root"));
  });

  it("scopes the tree to the root's channel — foreign-channel rows are excluded", async () => {
    const state = createEngineState();
    seedInstance(state, "root", { channelId: "X" });
    seedInstance(state, "child", {
      channelId: "X",
      parent: { instanceId: "root", stepExecId: "exec-a" },
    });
    // A same-named-parent row in another channel must not leak in.
    seedInstance(state, "intruder", {
      channelId: "Y",
      parent: { instanceId: "root", stepExecId: "exec-z" },
    });

    const tree = makeGetInstanceTree({ state });
    const node = await tree(asWorkflowId("root"));
    expect(node?.children.map((c) => c.instance.id)).toEqual([
      asWorkflowId("child"),
    ]);
  });

  it("can return the subtree rooted at a non-root child", async () => {
    const state = createEngineState();
    seedInstance(state, "root");
    seedInstance(state, "child", {
      parent: { instanceId: "root", stepExecId: "exec-a" },
    });
    seedInstance(state, "grandchild", {
      parent: { instanceId: "child", stepExecId: "exec-b" },
    });

    const tree = makeGetInstanceTree({ state });
    const node = await tree(asWorkflowId("child"));
    expect(node?.instance.id).toBe(asWorkflowId("child"));
    expect(node?.children.map((c) => c.instance.id)).toEqual([
      asWorkflowId("grandchild"),
    ]);
  });
});
