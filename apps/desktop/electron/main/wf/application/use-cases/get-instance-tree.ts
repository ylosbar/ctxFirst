/**
 * Read-only use-case: returns the hierarchy of instances rooted at a given
 * instance — the root plus every child spawned by a `template.invoke` step,
 * recursively (§11). Pure query over the in-memory {@link EngineState}.
 *
 * The whole tree shares the root's `channelId` (children inherit it from the
 * parent at spawn, §13), so we resolve the root's channel once and build the
 * tree from that channel's summaries — no cross-channel leakage, single pass.
 */
import type { EngineState } from "../engine-state";
import type { InstanceSummary } from "../../domain/projection";
import type { WorkflowId } from "../../domain/ids";

/** A node in the instance hierarchy: one instance plus its direct children. */
export type InstanceTreeNode = {
  instance: InstanceSummary;
  children: ReadonlyArray<InstanceTreeNode>;
};

type Deps = { state: EngineState };

/** Query returning the subtree rooted at `id`, or `null` if `id` is unknown. */
export type GetInstanceTree = (id: WorkflowId) => Promise<InstanceTreeNode | null>;

export const makeGetInstanceTree =
  ({ state }: Deps): GetInstanceTree =>
  async (id) => {
    const root = state.getInstance(id);
    if (!root) return null;

    // Every descendant lives in the root's channel; scope the lookup to it.
    const summaries = state.listInstances(root.channelId);

    // Index children by their parent instance id.
    const childrenByParent = new Map<WorkflowId, InstanceSummary[]>();
    for (const s of summaries) {
      const parentId = s.parent?.instanceId;
      if (parentId === undefined) continue;
      const bucket = childrenByParent.get(parentId);
      if (bucket) bucket.push(s);
      else childrenByParent.set(parentId, [s]);
    }

    const rootSummary = summaries.find((s) => s.id === id);
    if (!rootSummary) return null;

    // Build the subtree, guarding against malformed parent links forming a loop.
    const seen = new Set<WorkflowId>();
    const build = (summary: InstanceSummary): InstanceTreeNode => {
      seen.add(summary.id);
      const kids = (childrenByParent.get(summary.id) ?? [])
        .filter((c) => !seen.has(c.id))
        .map(build);
      return { instance: summary, children: kids };
    };

    return build(rootSummary);
  };
