import type { TimelineNode } from "../../timeline-types";
import type { RenderItem } from "./render-item";

/** Collect every collapsible key (loops + iterations) in render order. */
export const collectCollapsibleKeys = (
  nodes: ReadonlyArray<TimelineNode>,
  out: string[],
): void => {
  for (const node of nodes) {
    if (node.kind === "loop") {
      out.push(node.loopStepId);
      collectCollapsibleKeys(node.iterations, out);
    } else if (node.kind === "iteration") {
      out.push(node.iterationKey);
      collectCollapsibleKeys(node.children, out);
    }
  }
};

export const flattenNodes = (
  nodes: ReadonlyArray<TimelineNode>,
  depth: number,
  collapsed: ReadonlySet<string>,
  out: RenderItem[],
): void => {
  for (const node of nodes) {
    if (node.kind === "step") {
      out.push({ kind: "step", row: node.row, depth });
    } else if (node.kind === "loop") {
      out.push({ kind: "loopHeader", loop: node, depth });
      if (!collapsed.has(node.loopStepId)) {
        flattenNodes(node.iterations, depth + 1, collapsed, out);
      }
      // The collect row is the loop's closing bracket — always shown (when
      // reached), at the loop's own depth.
      if (node.collect) {
        out.push({ kind: "step", row: node.collect, depth });
      }
    } else {
      out.push({ kind: "iterationHeader", iteration: node, depth });
      if (!collapsed.has(node.iterationKey)) {
        flattenNodes(node.children, depth + 1, collapsed, out);
      }
    }
  }
};
