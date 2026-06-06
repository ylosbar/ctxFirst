/**
 * Outils de groupe du canvas : actions sur un groupe existant (renommage,
 * suppression avec ré-extraction des enfants) + outil de dessin d'un nouveau
 * groupe au rectangle.
 *
 * L'outil de dessin maintient l'état `groupDrawingMode` : tant qu'il est actif,
 * un overlay capture les événements pointeur au-dessus du canvas et trace un
 * rectangle qui devient une node `group` au pointerup, adoptant les steps dont
 * le centre absolu tombe dans son bbox. Escape annule un tracé en cours.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, PointerEvent, SetStateAction } from "react";
import type { Node, ReactFlowInstance } from "@xyflow/react";

import type { LayoutAutosaveControls } from "../../useLayoutAutosave";
import { GROUP_NODE_PREFIX } from "../graph/ids";
import { GROUP_MIN_DRAW_SIZE, stepCenterAbs } from "../graph/geometry";

type GroupActions = {
  onLabelChange: (id: string, label: string) => void;
  onDelete: (id: string) => void;
};

type Options = {
  setNodes: Dispatch<SetStateAction<Node[]>>;
  screenToFlowPosition: ReactFlowInstance["screenToFlowPosition"];
  layoutAutosave: LayoutAutosaveControls;
};

export type GroupToolsControls = {
  /** Bundle pour le `GroupActionsProvider`. */
  groupActions: GroupActions;
  /** `true` pendant que l'outil « créer un groupe » est armé. */
  groupDrawingMode: boolean;
  setGroupDrawingMode: Dispatch<SetStateAction<boolean>>;
  onOverlayPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onOverlayPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onOverlayPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
};

export const useGroupTools = ({
  setNodes,
  screenToFlowPosition,
  layoutAutosave,
}: Options): GroupToolsControls => {
  // État de l'outil "créer un groupe". Tant que `true`, un overlay capture
  // les événements pointeur au-dessus du canvas et trace un rectangle qui
  // devient une node de type "group" au mouseup.
  const [groupDrawingMode, setGroupDrawingMode] = useState(false);
  // Tracé en cours d'un groupe (entre pointerdown et pointerup de l'overlay).
  const groupDrawingRef = useRef<{
    id: string;
    startFlow: { x: number; y: number };
  } | null>(null);

  const onGroupLabelChange = useCallback(
    (id: string, label: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const data = (n.data ?? {}) as { label?: string };
          return { ...n, data: { ...data, label } };
        }),
      );
      layoutAutosave.scheduleSave();
    },
    [setNodes, layoutAutosave],
  );

  const onGroupDelete = useCallback(
    (id: string) => {
      // Extraction des enfants : leur position xyflow est relative au
      // groupe, il faut la traduire en absolue avant de retirer le parent —
      // sinon ils sautent à (group.x + step.x, group.y + step.y) puis à
      // (step.x, step.y) après reparenting, soit un offset perdu.
      setNodes((nds) => {
        const group = nds.find((n) => n.id === id);
        if (!group) return nds;
        const gx = group.position.x;
        const gy = group.position.y;
        return nds
          .filter((n) => n.id !== id)
          .map((n) => {
            if (n.parentId !== id) return n;
            const { parentId: _p, ...rest } = n;
            return {
              ...rest,
              position: { x: n.position.x + gx, y: n.position.y + gy },
            };
          });
      });
      layoutAutosave.scheduleSave();
    },
    [setNodes, layoutAutosave],
  );

  const groupActions = useMemo<GroupActions>(
    () => ({ onLabelChange: onGroupLabelChange, onDelete: onGroupDelete }),
    [onGroupLabelChange, onGroupDelete],
  );

  const onOverlayPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!groupDrawingMode) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = `${GROUP_NODE_PREFIX}${Date.now()}`;
      groupDrawingRef.current = { id, startFlow: flow };
      const newGroup: Node = {
        id,
        type: "group",
        position: { x: flow.x, y: flow.y },
        width: 1,
        height: 1,
        data: { label: "", isDrawing: true },
        draggable: false,
        selectable: false,
        zIndex: -1,
      };
      setNodes((nds) => [...nds, newGroup]);
    },
    [groupDrawingMode, screenToFlowPosition, setNodes],
  );

  const onOverlayPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drawing = groupDrawingRef.current;
      if (!drawing) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const x = Math.min(drawing.startFlow.x, flow.x);
      const y = Math.min(drawing.startFlow.y, flow.y);
      const w = Math.max(1, Math.abs(flow.x - drawing.startFlow.x));
      const h = Math.max(1, Math.abs(flow.y - drawing.startFlow.y));
      setNodes((nds) =>
        nds.map((n) =>
          n.id === drawing.id
            ? { ...n, position: { x, y }, width: w, height: h }
            : n,
        ),
      );
    },
    [screenToFlowPosition, setNodes],
  );

  const onOverlayPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer déjà relâché */
      }
      const drawing = groupDrawingRef.current;
      groupDrawingRef.current = null;
      setGroupDrawingMode(false);
      if (!drawing) return;
      setNodes((nds) => {
        const grp = nds.find((n) => n.id === drawing.id);
        if (!grp) return nds;
        const w = grp.width ?? 0;
        const h = grp.height ?? 0;
        // Trop petit → considéré comme un clic accidentel : on jette.
        if (w < GROUP_MIN_DRAW_SIZE || h < GROUP_MIN_DRAW_SIZE) {
          return nds.filter((n) => n.id !== drawing.id);
        }
        // Finalise le groupe + adopte les steps dont le centre absolu tombe
        // dans son bbox. Adoption = parentId + position traduite en relatif.
        // Les steps déjà parentés à un autre groupe ne sont pas volés (cas
        // d'un draw qui recouvre partiellement un groupe existant).
        const byId = new Map(nds.map((n) => [n.id, n]));
        const groupAbsX = grp.position.x;
        const groupAbsY = grp.position.y;
        const finalized: Node[] = nds.map((n) => {
          if (n.id === drawing.id) {
            return {
              ...n,
              data: { ...((n.data ?? {}) as object), isDrawing: false },
              draggable: true,
              selectable: true,
            };
          }
          if (n.type !== "step" || n.parentId) return n;
          const center = stepCenterAbs(n, byId);
          const inside =
            center.x >= groupAbsX &&
            center.x <= groupAbsX + w &&
            center.y >= groupAbsY &&
            center.y <= groupAbsY + h;
          if (!inside) return n;
          return {
            ...n,
            parentId: drawing.id,
            position: {
              x: n.position.x - groupAbsX,
              y: n.position.y - groupAbsY,
            },
          };
        });
        // Réordonner : groupe avant ses enfants. On extrait le groupe et on
        // le replace juste devant ses enfants (par sécurité on met tous les
        // groupes en tête de tableau, ce qui satisfait l'invariant xyflow).
        const groups = finalized.filter((n) => n.type === "group");
        const others = finalized.filter((n) => n.type !== "group");
        return [...groups, ...others];
      });
      layoutAutosave.scheduleSave();
    },
    [setNodes, layoutAutosave],
  );

  // Escape annule la création de groupe en cours.
  useEffect(() => {
    if (!groupDrawingMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const drawing = groupDrawingRef.current;
      groupDrawingRef.current = null;
      if (drawing) {
        setNodes((nds) => nds.filter((n) => n.id !== drawing.id));
      }
      setGroupDrawingMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [groupDrawingMode, setNodes]);

  return {
    groupActions,
    groupDrawingMode,
    setGroupDrawingMode,
    onOverlayPointerDown,
    onOverlayPointerMove,
    onOverlayPointerUp,
  };
};
