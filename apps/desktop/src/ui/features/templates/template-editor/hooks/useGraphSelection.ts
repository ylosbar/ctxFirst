/**
 * Propriétaire unique de la sélection du graphe (`selectedNodeId` /
 * `selectedEdgeId`) et de ses transitions.
 *
 * Centralise l'invariant « la sélection suit la dernière action » : une node et
 * un edge ne sont jamais sélectionnés en même temps (`selectStep` / `selectEdge`
 * désélectionnent l'autre), et `clearSelection` remet tout à zéro en une fois.
 *
 * Les **setters bruts** (`setSelectedNodeId` / `setSelectedEdgeId`) sont exposés
 * en plus : les hooks consommateurs (`useStepMutations`, `useCanvasHandlers`,
 * `useEdgeDropSuggestions`) les reçoivent encore tels quels — migration
 * incrémentale, leurs signatures ne changent pas dans cette phase. Ces setters
 * `useState` sont référentiellement stables.
 */
import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export type GraphSelection = {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectStep: (id: string) => void;
  selectEdge: (id: string) => void;
  clearSelection: () => void;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>;
};

export const useGraphSelection = (): GraphSelection => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const selectStep = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }, []);

  const selectEdge = useCallback((id: string) => {
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  return {
    selectedNodeId,
    selectedEdgeId,
    selectStep,
    selectEdge,
    clearSelection,
    setSelectedNodeId,
    setSelectedEdgeId,
  };
};
