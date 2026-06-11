import { type RenderItem, stepNamespacePrefix, subKey } from "./render-item";

/**
 * Wraps maximal runs of consecutive inlined step rows sharing a top-level
 * namespace prefix under a single collapsible `⊞ sub-workflow` header (§11c).
 * Renderer-only: the provenance is reconstructed purely from the namespaced
 * `stepId`, with no extra metadata. Non-step items (loop/iteration headers)
 * break a run.
 */
export const groupSubworkflowRuns = (
  items: ReadonlyArray<RenderItem>,
  collapsed: ReadonlySet<string>,
): RenderItem[] => {
  const out: RenderItem[] = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    const prefix = it.kind === "step" ? stepNamespacePrefix(it.row.stepId) : null;
    if (it.kind === "step" && prefix) {
      let j = i;
      const members: RenderItem[] = [];
      while (j < items.length) {
        const m = items[j];
        if (m.kind !== "step" || stepNamespacePrefix(m.row.stepId) !== prefix) break;
        members.push(m);
        j++;
      }
      out.push({ kind: "subworkflowHeader", prefix, depth: it.depth, count: members.length });
      if (!collapsed.has(subKey(prefix))) {
        for (const m of members) {
          out.push({ ...m, depth: m.depth + 1 });
        }
      }
      i = j;
    } else {
      out.push(it);
      i++;
    }
  }
  return out;
};
