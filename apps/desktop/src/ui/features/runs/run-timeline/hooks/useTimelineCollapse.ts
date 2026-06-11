import { useCallback, useMemo, useState } from "react";
import type { TimelineGap, TimelineModel } from "../../timeline-types";
import {
  type RenderItem,
  stepNamespacePrefix,
  subKey,
} from "../parts/render-item";
import { collectCollapsibleKeys, flattenNodes } from "../parts/flatten-nodes";
import { groupSubworkflowRuns } from "../parts/group-subworkflow-runs";

export type TimelineCollapse = {
  readonly collapsed: ReadonlySet<string>;
  readonly toggle: (key: string) => void;
  readonly toggleAll: () => void;
  readonly allCollapsed: boolean;
  readonly collapsibleKeys: string[];
  readonly items: RenderItem[];
  readonly gapsByExecId: Map<string, TimelineGap[]>;
};

/**
 * Owns the collapse set for the timeline tree and the memoised derivations that
 * read it: the flattened/grouped render items, the per-step gap index, and the
 * "collapse all" key set (loops, iterations, and the sub-workflow groups
 * derived from the flattened step ids). Dependency arrays are identical to the
 * former inlined version so the render output is unchanged.
 */
export const useTimelineCollapse = (model: TimelineModel): TimelineCollapse => {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const collapsibleKeys = useMemo(() => {
    const out: string[] = [];
    collectCollapsibleKeys(model.nodes, out);
    // Sub-workflow groups are derived from the flattened step ids (not the
    // node tree), so collect their keys separately for "collapse all".
    const flat: RenderItem[] = [];
    flattenNodes(model.nodes, 0, new Set(), flat);
    const seen = new Set<string>();
    for (const it of flat) {
      if (it.kind !== "step") continue;
      const prefix = stepNamespacePrefix(it.row.stepId);
      if (prefix && !seen.has(prefix)) {
        seen.add(prefix);
        out.push(subKey(prefix));
      }
    }
    return out;
  }, [model.nodes]);

  const allCollapsed =
    collapsibleKeys.length > 0 &&
    collapsibleKeys.every((k) => collapsed.has(k));

  const toggleAll = useCallback(() => {
    setCollapsed(allCollapsed ? new Set() : new Set(collapsibleKeys));
  }, [allCollapsed, collapsibleKeys]);

  const items = useMemo(() => {
    const out: RenderItem[] = [];
    flattenNodes(model.nodes, 0, collapsed, out);
    return groupSubworkflowRuns(out, collapsed);
  }, [model.nodes, collapsed]);

  const gapsByExecId = useMemo(() => {
    const map = new Map<string, TimelineGap[]>();
    for (const gap of model.gaps) {
      const list = map.get(gap.afterStepExecId);
      if (list) list.push(gap);
      else map.set(gap.afterStepExecId, [gap]);
    }
    return map;
  }, [model.gaps]);

  return {
    collapsed,
    toggle,
    toggleAll,
    allCollapsed,
    collapsibleKeys,
    items,
    gapsByExecId,
  };
};
