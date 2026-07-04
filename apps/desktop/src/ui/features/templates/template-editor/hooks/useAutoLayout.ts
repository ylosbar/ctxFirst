/**
 * Auto-layout group-aware du graphe (`handleAutoLayout`).
 *
 * Deux passes :
 *   1. Pour chaque groupe : layout BFS des enfants en coords LOCALES à partir
 *      de (PADDING, PADDING). On en déduit la taille du groupe (= bbox des
 *      enfants + padding) — le groupe est resizé pour épouser son contenu.
 *   2. On traite chaque groupe et chaque step ungrouped comme un "supernode"
 *      avec sa taille calculée, puis on layoute ces supernodes au niveau
 *      global. La BFS au niveau supernode utilise les edges qui croisent une
 *      frontière de cluster (un edge intra-groupe ne compte pas pour l'ordre
 *      global).
 *
 * Effet net : les groupes survivent à l'auto-layout — leurs membres restent
 * dedans et le groupe se redimensionne pour les contenir. S'appuie sur les
 * helpers purs de `graph/auto-layout` + `graph/geometry`.
 */
import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";

import type { LayoutAutosaveControls } from "../../useLayoutAutosave";
import { GROUP_PADDING } from "../graph/geometry";
import {
  AUTO_LAYOUT_BASE_X,
  AUTO_LAYOUT_BASE_Y,
  AUTO_LAYOUT_DEFAULT_HEIGHT,
  AUTO_LAYOUT_DEFAULT_WIDTH,
  computeAutoLayoutOrder,
  layoutLine,
  nodeToSized,
  type AutoLayoutMode,
  type SizedItem,
} from "../graph/auto-layout";
import type { EdgeData } from "../graph/edge-style";

type Options = {
  nodes: Node[];
  edges: Edge[];
  entryStepId: string | null;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  layoutAutosave: LayoutAutosaveControls;
  rf: ReactFlowInstance;
  /** Snapshot d'historique (undoable) posé avant le relayout global. */
  commit: (opts?: { coalesceKey?: string }) => void;
};

export type AutoLayoutControls = {
  /** À brancher sur les boutons d'auto-layout de la toolbar. */
  handleAutoLayout: (mode: AutoLayoutMode) => void;
};

export const useAutoLayout = ({
  nodes,
  edges,
  entryStepId,
  setNodes,
  layoutAutosave,
  rf,
  commit,
}: Options): AutoLayoutControls => {
  const handleAutoLayout = useCallback(
    (mode: AutoLayoutMode) => {
      const allSteps = nodes.filter((n) => n.type === "step");
      if (allSteps.length === 0) return;
      commit();
      const allGroups = nodes.filter((n) => n.type === "group");
      const groupIds = new Set(allGroups.map((g) => g.id));

      const childrenByGroup = new Map<string, Node[]>();
      const ungroupedSteps: Node[] = [];
      for (const s of allSteps) {
        if (s.parentId && groupIds.has(s.parentId)) {
          const arr = childrenByGroup.get(s.parentId) ?? [];
          arr.push(s);
          childrenByGroup.set(s.parentId, arr);
        } else {
          ungroupedSteps.push(s);
        }
      }

      type GroupSuper = {
        kind: "group";
        id: string;
        width: number;
        height: number;
        childLocalPositions: Map<string, { x: number; y: number }>;
      };
      type StepSuper = {
        kind: "step";
        id: string;
        width: number;
        height: number;
      };
      type Super = GroupSuper | StepSuper;
      const supers = new Map<string, Super>();

      for (const [groupId, children] of childrenByGroup) {
        const localOrder = computeAutoLayoutOrder(children, edges, entryStepId);
        const localPositions = layoutLine(
          children.map(nodeToSized),
          localOrder,
          mode,
          GROUP_PADDING,
          GROUP_PADDING,
        );
        let maxRight = 0;
        let maxBottom = 0;
        for (const child of children) {
          const p = localPositions.get(child.id);
          if (!p) continue;
          const w = child.measured?.width ?? AUTO_LAYOUT_DEFAULT_WIDTH;
          const h = child.measured?.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT;
          if (p.x + w > maxRight) maxRight = p.x + w;
          if (p.y + h > maxBottom) maxBottom = p.y + h;
        }
        supers.set(groupId, {
          kind: "group",
          id: groupId,
          width: maxRight + GROUP_PADDING,
          height: maxBottom + GROUP_PADDING,
          childLocalPositions: localPositions,
        });
      }
      for (const step of ungroupedSteps) {
        supers.set(step.id, {
          kind: "step",
          id: step.id,
          width: step.measured?.width ?? AUTO_LAYOUT_DEFAULT_WIDTH,
          height: step.measured?.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT,
        });
      }

      // Map step → supernode pour résoudre les edges inter-clusters.
      const stepToSuper = new Map<string, string>();
      for (const [groupId, children] of childrenByGroup) {
        for (const c of children) stepToSuper.set(c.id, groupId);
      }
      for (const s of ungroupedSteps) stepToSuper.set(s.id, s.id);

      const superAdj = new Map<string, string[]>();
      for (const e of edges) {
        const sa = stepToSuper.get(e.source);
        const sb = stepToSuper.get(e.target);
        if (!sa || !sb || sa === sb) continue;
        if ((e.data as EdgeData | undefined)?.isLoop) continue;
        const arr = superAdj.get(sa) ?? [];
        arr.push(sb);
        superAdj.set(sa, arr);
      }

      const startSuper = entryStepId ? stepToSuper.get(entryStepId) : undefined;
      const superIds = Array.from(supers.keys());
      const visited = new Set<string>();
      const superOrder: string[] = [];
      const start =
        startSuper && supers.has(startSuper) ? startSuper : superIds[0];
      if (start) {
        const queue: string[] = [start];
        while (queue.length > 0) {
          const sid = queue.shift()!;
          if (visited.has(sid)) continue;
          visited.add(sid);
          superOrder.push(sid);
          for (const next of superAdj.get(sid) ?? []) {
            if (!visited.has(next)) queue.push(next);
          }
        }
      }
      for (const sid of superIds) {
        if (!visited.has(sid)) superOrder.push(sid);
      }

      const superSized: SizedItem[] = superOrder.map((sid) => {
        const sn = supers.get(sid)!;
        return { id: sid, width: sn.width, height: sn.height };
      });
      const superPositions = layoutLine(
        superSized,
        superOrder,
        mode,
        AUTO_LAYOUT_BASE_X,
        AUTO_LAYOUT_BASE_Y,
      );

      const next: Node[] = nodes.map((n) => {
        if (n.type === "group") {
          const sn = supers.get(n.id);
          const pos = superPositions.get(n.id);
          if (!sn || !pos || sn.kind !== "group") return n;
          return { ...n, position: pos, width: sn.width, height: sn.height };
        }
        if (n.type === "step") {
          const superId = stepToSuper.get(n.id);
          if (!superId) return n;
          const sn = supers.get(superId);
          if (!sn) return n;
          if (sn.kind === "group") {
            const local = sn.childLocalPositions.get(n.id);
            if (!local) return n;
            return { ...n, parentId: superId, position: local };
          }
          const pos = superPositions.get(superId);
          if (!pos) return n;
          const { parentId: _p, ...rest } = n;
          return { ...rest, position: pos };
        }
        return n;
      });
      // Invariant xyflow : parents avant enfants — l'ordre est déjà bon car
      // on a juste mappé les nodes sans changer leur séquence.
      setNodes(next);

      // Recentre la vue sur le bbox global de tous les supernodes placés.
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const sid of superOrder) {
        const p = superPositions.get(sid);
        const sn = supers.get(sid);
        if (!p || !sn) continue;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x + sn.width > maxX) maxX = p.x + sn.width;
        if (p.y + sn.height > maxY) maxY = p.y + sn.height;
      }
      if (Number.isFinite(minX)) {
        rf.setCenter((minX + maxX) / 2, (minY + maxY) / 2, {
          zoom: rf.getZoom(),
          duration: 300,
        });
      }
      // setNodes ne flush pas synchroniquement → le nodesRef interne du hook
      // sera mis à jour au prochain render, avant que le timer debounced ne
      // tire (~500 ms).
      layoutAutosave.scheduleSave();
    },
    [nodes, edges, entryStepId, setNodes, layoutAutosave, rf, commit],
  );

  return { handleAutoLayout };
};
