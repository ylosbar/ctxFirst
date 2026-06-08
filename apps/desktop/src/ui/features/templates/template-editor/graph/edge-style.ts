import type { Edge, Node } from "@xyflow/react";

export type EdgeData = { isLoop: boolean; order?: number };

/**
 * Loop-edge label. Auto-loop sources (judges / validators — see
 * `AUTO_LOOP_SOURCE_KINDS`) re-invoke automatically on their pinned port, so
 * the loop is machine-driven; any other source looping back is a human-feedback
 * loop. `isAutoLoop` is irrelevant when `isLoop` is false.
 */
export const edgeStyle = (
  isLoop: boolean,
  isAutoLoop = false,
): Partial<Edge> => ({
  animated: false,
  style: isLoop
    ? { strokeDasharray: "2 4", stroke: "var(--color-orange-500, #f97316)" }
    : undefined,
  label: isLoop
    ? isAutoLoop
      ? "Auto-validation"
      : "Human validation"
    : undefined,
});

export const minimapNodeColor = (node: Node): string => {
  if (node.type === "start") return "var(--primary)";
  if (node.type === "variable") return "var(--muted-foreground)";
  return node.selected ? "var(--primary)" : "var(--card)";
};

export const minimapNodeStrokeColor = (node: Node): string =>
  node.selected ? "var(--primary)" : "var(--border)";
