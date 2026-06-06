import type { Edge, Node } from "@xyflow/react";

export type EdgeData = { isLoop: boolean; order?: number };

export const edgeStyle = (isLoop: boolean): Partial<Edge> => ({
  animated: false,
  style: isLoop
    ? { strokeDasharray: "2 4", stroke: "var(--color-orange-500, #f97316)" }
    : undefined,
  label: isLoop ? "Human validation" : undefined,
});

export const minimapNodeColor = (node: Node): string => {
  if (node.type === "start") return "var(--primary)";
  if (node.type === "variable") return "var(--muted-foreground)";
  return node.selected ? "var(--primary)" : "var(--card)";
};

export const minimapNodeStrokeColor = (node: Node): string =>
  node.selected ? "var(--primary)" : "var(--border)";
