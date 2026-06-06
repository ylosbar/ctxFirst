import type { Node } from "@xyflow/react";

import {
  AUTO_LAYOUT_DEFAULT_HEIGHT,
  AUTO_LAYOUT_DEFAULT_WIDTH,
} from "./auto-layout";

export const GROUP_MIN_DRAW_SIZE = 24;
// Marge intérieure d'un groupe : espace entre le bord du groupe et la bbox
// des steps qu'il contient. Utilisé pour le placement initial des enfants
// (lors du draw-to-create) et pour le resize auto-layout / drop.
export const GROUP_PADDING = 24;

// Position absolue d'une node : si elle est enfant d'un groupe, sa `position`
// xyflow est relative au parent — il faut ajouter l'absolu du parent. Les
// groupes ne s'imbriquent pas (un seul niveau), donc la récursion termine
// en pratique en 1 saut, mais on l'écrit générale pour rester safe.
export const absPosOf = (
  node: Node,
  byId: ReadonlyMap<string, Node>,
): { x: number; y: number } => {
  if (!node.parentId) return node.position;
  const parent = byId.get(node.parentId);
  if (!parent) return node.position;
  const parentAbs = absPosOf(parent, byId);
  return {
    x: parentAbs.x + node.position.x,
    y: parentAbs.y + node.position.y,
  };
};

export const stepCenterAbs = (
  n: Node,
  byId: ReadonlyMap<string, Node>,
): { x: number; y: number } => {
  const w = n.measured?.width ?? n.width ?? AUTO_LAYOUT_DEFAULT_WIDTH;
  const h = n.measured?.height ?? n.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT;
  const p = absPosOf(n, byId);
  return { x: p.x + w / 2, y: p.y + h / 2 };
};

export const groupBounds = (
  g: Node,
): { x: number; y: number; w: number; h: number } => {
  const w = g.width ?? (g.style?.width as number | undefined) ?? 0;
  const h = g.height ?? (g.style?.height as number | undefined) ?? 0;
  return { x: g.position.x, y: g.position.y, w, h };
};

// Trouve le groupe dont le bbox absolu contient le point passé. Si plusieurs
// groupes contiennent le point (overlap), on prend le dernier de l'ordre de
// la liste (= dessiné en dernier visuellement). Renvoie `null` sinon.
export const findContainingGroupId = (
  point: { x: number; y: number },
  groups: ReadonlyArray<Node>,
): string | null => {
  let hit: string | null = null;
  for (const g of groups) {
    const { x, y, w, h } = groupBounds(g);
    if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) {
      hit = g.id;
    }
  }
  return hit;
};

// Grow-only : assure que `groupId` enclos tous ses enfants step avec une
// marge `GROUP_PADDING`. Si des enfants débordent à gauche/au-dessus, on
// décale le groupe en monde et on compense les positions locales des
// enfants pour préserver leurs coordonnées monde. Ne rétrécit jamais —
// seul l'auto-layout, qui recompose tout, autorise le shrink.
export const resizeGroupToFit = (
  nodes: ReadonlyArray<Node>,
  groupId: string,
): Node[] => {
  const group = nodes.find((n) => n.id === groupId);
  if (!group) return [...nodes];
  const children = nodes.filter(
    (n) => n.parentId === groupId && n.type === "step",
  );
  if (children.length === 0) return [...nodes];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of children) {
    const w = c.measured?.width ?? AUTO_LAYOUT_DEFAULT_WIDTH;
    const h = c.measured?.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT;
    if (c.position.x < minX) minX = c.position.x;
    if (c.position.y < minY) minY = c.position.y;
    if (c.position.x + w > maxX) maxX = c.position.x + w;
    if (c.position.y + h > maxY) maxY = c.position.y + h;
  }

  const currentWidth = group.width ?? 0;
  const currentHeight = group.height ?? 0;
  const shiftX = Math.min(0, minX - GROUP_PADDING);
  const shiftY = Math.min(0, minY - GROUP_PADDING);
  const rightLocal = Math.max(currentWidth, maxX + GROUP_PADDING);
  const bottomLocal = Math.max(currentHeight, maxY + GROUP_PADDING);
  const newWidth = rightLocal - shiftX;
  const newHeight = bottomLocal - shiftY;

  if (
    shiftX === 0 &&
    shiftY === 0 &&
    newWidth === currentWidth &&
    newHeight === currentHeight
  ) {
    return [...nodes];
  }

  return nodes.map((n) => {
    if (n.id === groupId) {
      return {
        ...n,
        position: {
          x: group.position.x + shiftX,
          y: group.position.y + shiftY,
        },
        width: newWidth,
        height: newHeight,
      };
    }
    if (n.parentId === groupId) {
      return {
        ...n,
        position: { x: n.position.x - shiftX, y: n.position.y - shiftY },
      };
    }
    return n;
  });
};
