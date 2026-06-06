import type { Edge, Node } from "@xyflow/react";

import type { EdgeData } from "./edge-style";

export const AUTO_LAYOUT_BASE_X = 80;
export const AUTO_LAYOUT_BASE_Y = 80;
export const AUTO_LAYOUT_VERTICAL_GAP = 60;
export const AUTO_LAYOUT_HORIZONTAL_GAP = 80;
export const AUTO_LAYOUT_DEFAULT_WIDTH = 220;
export const AUTO_LAYOUT_DEFAULT_HEIGHT = 120;

export type AutoLayoutMode = "vertical" | "horizontal" | "two-columns";

export const computeStepLevels = (
  stepIds: ReadonlyArray<string>,
  transitions: ReadonlyArray<{ from: string; to: string; isLoop: boolean }>,
  entryStepId: string,
): Map<string, number> => {
  const forward = new Map<string, string[]>();
  for (const t of transitions) {
    if (t.isLoop || t.from === t.to) continue;
    const arr = forward.get(t.from) ?? [];
    arr.push(t.to);
    forward.set(t.from, arr);
  }
  const level = new Map<string, number>();
  const queue: Array<{ id: string; lv: number }> = [{ id: entryStepId, lv: 0 }];
  while (queue.length > 0) {
    const { id, lv } = queue.shift()!;
    if ((level.get(id) ?? -1) >= lv) continue;
    level.set(id, lv);
    for (const next of forward.get(id) ?? []) {
      queue.push({ id: next, lv: lv + 1 });
    }
  }
  for (const id of stepIds) {
    if (!level.has(id)) level.set(id, 0);
  }
  return level;
};

// Ordering used for every auto-layout: BFS from the entry step along
// non-loop transitions, then any unreachable steps appended in their
// existing array order — keeps the visible flow direction stable.
export const computeAutoLayoutOrder = (
  nodes: ReadonlyArray<Node>,
  edges: ReadonlyArray<Edge>,
  entryStepId: string | null,
): string[] => {
  const stepIds = nodes.map((n) => n.id);
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if ((e.data as EdgeData | undefined)?.isLoop) continue;
    if (e.source === e.target) continue;
    const arr = adj.get(e.source) ?? [];
    arr.push(e.target);
    adj.set(e.source, arr);
  }
  const visited = new Set<string>();
  const order: string[] = [];
  const start =
    entryStepId && stepIds.includes(entryStepId) ? entryStepId : stepIds[0];
  if (start) {
    const queue: string[] = [start];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      order.push(id);
      for (const next of adj.get(id) ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }
  }
  for (const id of stepIds) {
    if (!visited.has(id)) order.push(id);
  }
  return order;
};

export type SizedItem = { id: string; width: number; height: number };

// Place une liste d'items dimensionnés selon le mode choisi, à partir
// de l'origine (baseX, baseY). Renvoie une map id → position. Pure : ne
// dépend pas des constantes BASE_X/Y → réutilisable pour layouter à
// l'intérieur d'un groupe (origine = padding) ou au niveau supernode
// (origine = base globale du canvas).
export const layoutLine = (
  items: ReadonlyArray<SizedItem>,
  order: ReadonlyArray<string>,
  mode: AutoLayoutMode,
  baseX: number,
  baseY: number,
): Map<string, { x: number; y: number }> => {
  const sizeById = new Map(items.map((i) => [i.id, i]));
  const widthOf = (id: string) =>
    sizeById.get(id)?.width ?? AUTO_LAYOUT_DEFAULT_WIDTH;
  const heightOf = (id: string) =>
    sizeById.get(id)?.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT;
  const positions = new Map<string, { x: number; y: number }>();

  if (mode === "vertical") {
    let y = baseY;
    for (const id of order) {
      positions.set(id, { x: baseX, y });
      y += heightOf(id) + AUTO_LAYOUT_VERTICAL_GAP;
    }
  } else if (mode === "horizontal") {
    let x = baseX;
    for (const id of order) {
      positions.set(id, { x, y: baseY });
      x += widthOf(id) + AUTO_LAYOUT_HORIZONTAL_GAP;
    }
  } else {
    const columnXOffset =
      AUTO_LAYOUT_DEFAULT_WIDTH + AUTO_LAYOUT_HORIZONTAL_GAP;
    let y = baseY;
    order.forEach((id, idx) => {
      const col = idx % 2;
      positions.set(id, { x: baseX + col * columnXOffset, y });
      y += heightOf(id) + AUTO_LAYOUT_VERTICAL_GAP;
    });
  }
  return positions;
};

export const nodeToSized = (n: Node): SizedItem => ({
  id: n.id,
  width: n.measured?.width ?? AUTO_LAYOUT_DEFAULT_WIDTH,
  height: n.measured?.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT,
});
