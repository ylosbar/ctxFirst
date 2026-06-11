/**
 * Outil de canvas de l'éditeur de templates : `drag` (défaut) ou `select`.
 *
 * - `drag` — comportement historique : le left-drag sur le pane *pan* le viewport.
 * - `select` — le left-drag trace un rectangle de sélection (primitive native
 *   React Flow) ; le pan reste possible au clic molette / clic droit.
 *
 * Le hook est volontairement minimal (un `useState` + l'`Escape` qui ramène en
 * `drag`). Il existe surtout pour **nommer** le concept et garder l'orchestrateur
 * lisible — il pourra plus tard absorber la mutuelle-exclusion avec le dessin de
 * groupe et des raccourcis clavier (`V`/`S`) sans toucher au call site.
 *
 * La dérivation des props `<ReactFlow>` est exposée séparément (`deriveCanvasMode\
 * Props`) en fonction **pure** pour rester testable sans monter de canvas.
 */
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { SelectionMode } from "@xyflow/react";

export type CanvasMode = "drag" | "select";

export type CanvasModeControls = {
  canvasMode: CanvasMode;
  setCanvasMode: Dispatch<SetStateAction<CanvasMode>>;
};

/**
 * Props `<ReactFlow>` pilotant le geste de left-drag selon l'outil courant.
 * En view-run la sélection au rectangle n'a pas de sens (lecture seule) → on
 * force le comportement `drag`.
 */
export type CanvasModeFlowProps = {
  /** `true` = left-drag pan ; `[1, 2]` = pan au clic molette + droit seulement. */
  panOnDrag: boolean | number[];
  selectionOnDrag: boolean;
  selectionMode: SelectionMode;
};

export const deriveCanvasModeProps = (
  canvasMode: CanvasMode,
  isViewRun: boolean,
): CanvasModeFlowProps => {
  const isSelect = canvasMode === "select" && !isViewRun;
  return {
    // `[1, 2]` = boutons molette + droit ; le left est libéré pour la box.
    panOnDrag: isSelect ? [1, 2] : true,
    selectionOnDrag: isSelect,
    // Constant — ignoré par React Flow quand `selectionOnDrag` est faux.
    // `Partial` : une node est attrapée dès qu'elle chevauche la box.
    selectionMode: SelectionMode.Partial,
  };
};

export const useCanvasMode = (): CanvasModeControls => {
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("drag");

  // Escape repasse en `drag` (cohérent avec l'Escape qui annule le dessin de
  // groupe). On n'écoute que pendant le mode select pour ne rien capter sinon.
  useEffect(() => {
    if (canvasMode !== "select") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCanvasMode("drag");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canvasMode]);

  return { canvasMode, setCanvasMode };
};
