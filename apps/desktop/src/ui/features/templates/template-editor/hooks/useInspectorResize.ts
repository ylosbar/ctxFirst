/**
 * Resize de l'overlay Inspector de l'éditeur de template.
 *
 * La largeur est persistée globalement dans WorkbenchPrefs ; pendant un drag on
 * bypass la persistance via un state local (`inspectorDragWidth`) pour éviter
 * une écriture localStorage par pixel. Commit au pointerup. Zéro couplage au
 * graphe — uniquement le store/prefs Workbench.
 */
import { useCallback, useRef, useState } from "react";

import {
  setTemplateEditorInspectorWidth,
  useTemplateEditorInspectorWidth,
} from "../../../../workbench/store";
import {
  INSPECTOR_WIDTH_MAX_PX,
  INSPECTOR_WIDTH_MIN_PX,
} from "../../../../workbench/prefs";

export type InspectorResizeControls = {
  /** Largeur effective à appliquer au panneau (drag en cours sinon persistée). */
  inspectorWidth: number;
  /** Non-`null` uniquement pendant un drag actif (sert au style de la poignée). */
  inspectorDragWidth: number | null;
  onInspectorResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  onInspectorResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onInspectorResizeEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
};

export const useInspectorResize = (): InspectorResizeControls => {
  const persistedInspectorWidth = useTemplateEditorInspectorWidth();
  const [inspectorDragWidth, setInspectorDragWidth] = useState<number | null>(
    null,
  );
  const inspectorWidth = inspectorDragWidth ?? persistedInspectorWidth;
  const inspectorResizeRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const onInspectorResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      inspectorResizeRef.current = {
        startX: e.clientX,
        startWidth: persistedInspectorWidth,
      };
      setInspectorDragWidth(persistedInspectorWidth);
    },
    [persistedInspectorWidth],
  );

  const onInspectorResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ref = inspectorResizeRef.current;
      if (!ref) return;
      // Overlay ancré à droite : déplacer le curseur vers la gauche
      // (delta négatif sur clientX) doit AGRANDIR la largeur.
      const delta = ref.startX - e.clientX;
      const raw = ref.startWidth + delta;
      const next = Math.min(
        INSPECTOR_WIDTH_MAX_PX,
        Math.max(INSPECTOR_WIDTH_MIN_PX, raw),
      );
      setInspectorDragWidth(next);
    },
    [],
  );

  const onInspectorResizeEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!inspectorResizeRef.current) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      inspectorResizeRef.current = null;
      setInspectorDragWidth((cur) => {
        if (cur !== null) setTemplateEditorInspectorWidth(cur);
        return null;
      });
    },
    [],
  );

  return {
    inspectorWidth,
    inspectorDragWidth,
    onInspectorResizeStart,
    onInspectorResizeMove,
    onInspectorResizeEnd,
  };
};
