import type { Edge, Node } from "@xyflow/react";
import type {
  GroupLayout,
  StickyNoteLayout,
  TemplateLayout,
} from "@shared/wf/layout";
import type {
  TemplateStepDraft,
  TemplateView,
} from "@/domain/workflow/types";

import {
  AUTO_LAYOUT_DEFAULT_HEIGHT,
  AUTO_LAYOUT_DEFAULT_WIDTH,
  computeStepLevels,
} from "./auto-layout";
import { edgeStyle } from "./edge-style";
import { findContainingGroupId } from "./geometry";
import { AUTO_LOOP_SOURCE_KINDS } from "./ids";

export const groupLayoutToNode = (g: GroupLayout): Node => ({
  id: g.id,
  type: "group",
  position: { x: g.position.x, y: g.position.y },
  width: g.size.width,
  height: g.size.height,
  data: { label: g.label ?? "" },
  zIndex: -1,
});

export const stickyNoteLayoutToNode = (s: StickyNoteLayout): Node => ({
  id: s.id,
  type: "stickyNote",
  position: { x: s.position.x, y: s.position.y },
  width: s.size.width,
  height: s.size.height,
  data: { text: s.text, color: s.color ?? "yellow" },
  zIndex: -1,
});

export const templateToGraph = (
  tpl: TemplateView,
  layout: TemplateLayout | null,
): { nodes: Node[]; edges: Edge[]; entryStepId: string } => {
  const levels = computeStepLevels(
    tpl.steps.map((s) => s.id),
    tpl.transitions,
    tpl.entryStep,
  );
  const yIndexByLevel = new Map<number, number>();

  const groupNodes: Node[] = (layout?.groups ?? []).map(groupLayoutToNode);
  const groupById = new Map(groupNodes.map((g) => [g.id, g]));
  const noteNodes: Node[] = (layout?.stickyNotes ?? []).map(
    stickyNoteLayoutToNode,
  );

  const stepNodes: Node[] = tpl.steps.map((s) => {
    const lv = levels.get(s.id) ?? 0;
    const yIdx = yIndexByLevel.get(lv) ?? 0;
    yIndexByLevel.set(lv, yIdx + 1);
    const stepData: TemplateStepDraft = {
      id: s.id,
      name: s.name,
      kind: s.kind,
      actorRole: s.actorRole,
      config: s.config ?? {},
      humanGateRequired: s.humanGateRequired,
      writesTo: s.writesTo,
      readsFrom: s.readsFrom,
      note: s.note,
    };
    const saved = layout?.positions[s.id];
    if (saved && saved.parentId && groupById.has(saved.parentId)) {
      // Layout au nouveau format : position déjà relative au parent.
      return {
        id: s.id,
        type: "step",
        position: { x: saved.x, y: saved.y },
        parentId: saved.parentId,
        data: { ...stepData, isEntry: s.id === tpl.entryStep },
      };
    }
    // Fallback : position absolue (anciens layouts ou nouveau step sans
    // sauvegarde). On détecte l'appartenance par containment du centre du
    // step dans une bbox de groupe, puis on traduit en coords locales si
    // un parent est trouvé — migration silencieuse vers le modèle parentId.
    const absPos = saved
      ? { x: saved.x, y: saved.y }
      : { x: 80 + lv * 280, y: 80 + yIdx * 140 };
    const center = {
      x: absPos.x + AUTO_LAYOUT_DEFAULT_WIDTH / 2,
      y: absPos.y + AUTO_LAYOUT_DEFAULT_HEIGHT / 2,
    };
    const parentId = findContainingGroupId(center, groupNodes);
    if (parentId) {
      const parent = groupById.get(parentId)!;
      return {
        id: s.id,
        type: "step",
        position: {
          x: absPos.x - parent.position.x,
          y: absPos.y - parent.position.y,
        },
        parentId,
        data: { ...stepData, isEntry: s.id === tpl.entryStep },
      };
    }
    return {
      id: s.id,
      type: "step",
      position: absPos,
      data: { ...stepData, isEntry: s.id === tpl.entryStep },
    };
  });
  const kindByStepId = new Map(tpl.steps.map((s) => [s.id, s.kind]));
  const edges: Edge[] = tpl.transitions.map((t, i) => {
    const isSelfLoop = t.from === t.to;
    const isAutoLoop =
      t.isLoop && AUTO_LOOP_SOURCE_KINDS.has(kindByStepId.get(t.from) ?? "");
    return {
      id: `e-${t.from}-${t.to}-${i}`,
      source: t.from,
      sourceHandle: t.fromPort,
      target: t.to,
      targetHandle: t.toPort,
      type: isSelfLoop ? "selfLoop" : "step",
      data: {
        isLoop: t.isLoop,
        ...(typeof t.order === "number" ? { order: t.order } : {}),
      },
      zIndex: isSelfLoop ? 1000 : undefined,
      ...edgeStyle(t.isLoop, isAutoLoop),
    };
  });
  // React Flow exige que les parents apparaissent AVANT leurs enfants dans
  // le tableau de nodes (sinon le mounting des enfants se fait sans ancrage
  // correct). Comme les groupes sont déjà en tête, et qu'on ne nest pas les
  // groupes, l'ordre `[groupes…, steps…]` satisfait l'invariant.
  return {
    nodes: [...groupNodes, ...noteNodes, ...stepNodes],
    edges,
    entryStepId: tpl.entryStep,
  };
};
