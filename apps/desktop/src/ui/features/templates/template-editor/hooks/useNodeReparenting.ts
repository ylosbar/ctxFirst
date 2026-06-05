/**
 * Reparenting positionnel d'un step au drop (`onNodeDragStop`).
 *
 * Au relâchement d'un step, on ré-évalue son groupe parent selon le containment
 * de son centre absolu, on traduit ses coordonnées si le parent change, et on
 * auto-grow les groupes affectés pour qu'ils enclosent leurs enfants avec
 * padding. Pour un drop de groupe, React Flow a déjà déplacé les enfants — il
 * suffit de programmer la sauvegarde.
 */
import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node } from "@xyflow/react";

import type { LayoutAutosaveControls } from "../../useLayoutAutosave";
import {
  absPosOf,
  findContainingGroupId,
  resizeGroupToFit,
  stepCenterAbs,
} from "../graph/geometry";

type Options = {
  setNodes: Dispatch<SetStateAction<Node[]>>;
  layoutAutosave: LayoutAutosaveControls;
};

export type NodeReparentingControls = {
  /** À brancher sur `<ReactFlow onNodeDragStop={…}>` (hors view-run). */
  handleNodeDragStop: (_e: unknown, dragged: Node) => void;
};

export const useNodeReparenting = ({
  setNodes,
  layoutAutosave,
}: Options): NodeReparentingControls => {
  const handleNodeDragStop = useCallback(
    (_e: unknown, dragged: Node) => {
      if (dragged.type !== "step") {
        layoutAutosave.onNodeDragStop();
        return;
      }
      setNodes((nds) => {
        const byId = new Map(nds.map((n) => [n.id, n]));
        const node = byId.get(dragged.id);
        if (!node) return nds;
        const absCenter = stepCenterAbs(node, byId);
        const groupsArr = nds.filter((n) => n.type === "group");
        const containingId = findContainingGroupId(absCenter, groupsArr);
        const currentParentId = node.parentId ?? null;

        if (containingId === currentParentId) {
          // Pas de reparenting : on auto-grow seulement le parent courant
          // (s'il y en a un) au cas où le step ait été poussé vers les bords.
          return currentParentId ? resizeGroupToFit(nds, currentParentId) : nds;
        }

        const next: Node[] = nds.map((n) => {
          if (n.id !== node.id) return n;
          const absPos = absPosOf(n, byId);
          if (containingId) {
            const parent = byId.get(containingId);
            if (!parent) return n;
            return {
              ...n,
              parentId: containingId,
              position: {
                x: absPos.x - parent.position.x,
                y: absPos.y - parent.position.y,
              },
            };
          }
          // Out of any group → on dé-parente et on remonte en absolu.
          const { parentId: _p, ...rest } = n;
          return { ...rest, position: absPos };
        });

        // Invariant xyflow : parents avant enfants. On replace tous les
        // groupes en tête (l'ordre relatif des groupes entre eux n'a pas
        // d'incidence puisqu'ils ne s'imbriquent pas).
        const groupsReordered = next.filter((n) => n.type === "group");
        const others = next.filter((n) => n.type !== "group");
        let result: Node[] = [...groupsReordered, ...others];

        if (currentParentId) result = resizeGroupToFit(result, currentParentId);
        if (containingId) result = resizeGroupToFit(result, containingId);
        return result;
      });
      layoutAutosave.onNodeDragStop();
    },
    [setNodes, layoutAutosave],
  );

  return { handleNodeDragStop };
};
