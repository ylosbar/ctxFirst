/**
 * Mutations de domaine sur la sélection courante (step ou edge).
 *
 * Regroupe les dérivés de sélection (`selectedStep` / `selectedEdgeInfo`) et les
 * mutateurs qui agissent sur l'élément sélectionné :
 *   - `updateSelectedStep` — applique l'édition de l'inspecteur, en propageant un
 *     éventuel renommage d'ID dans `entryStepId` et les extrémités des edges ;
 *   - `deleteSelectedStep` — retire la node + ses edges incidents ;
 *   - `setSelectedAsEntry` — (dé)marque la step sélectionnée comme entrée ;
 *   - `toggleSelectedEdgeLoop` / `deleteSelectedEdge` — édition de l'edge.
 *
 * La sélection elle-même (`selectedNodeId` / `selectedEdgeId`) reste possédée par
 * l'orchestrateur : de nombreux autres handlers la fixent (ajout de step, drop
 * d'edge, clic…). Le hook ne fait que la lire et, pour `updateSelectedStep` /
 * `deleteSelectedStep`, la réviser via les setters fournis.
 */
import { useCallback, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

import type { TemplateStepDraft } from "../../../../../domain/workflow/types";
import type { SelectedEdgeInfo } from "../../../../stores/template-canvas-store";
import { edgeStyle, type EdgeData } from "../graph/edge-style";
import { AUTO_LOOP_SOURCE_KINDS } from "../graph/ids";

type Options = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  entryStepId: string | null;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setEntryStepId: Dispatch<SetStateAction<string | null>>;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>;
  /** Snapshot d'historique posé en tête de chaque mutation (undoable). */
  commit: (opts?: { coalesceKey?: string }) => void;
};

export type StepMutationControls = {
  selectedStep: TemplateStepDraft | null;
  selectedEdgeInfo: SelectedEdgeInfo | null;
  updateSelectedStep: (next: TemplateStepDraft) => void;
  deleteSelectedStep: () => void;
  setSelectedAsEntry: () => void;
  toggleSelectedEdgeLoop: () => void;
  deleteSelectedEdge: () => void;
};

export const useStepMutations = ({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  entryStepId,
  setNodes,
  setEdges,
  setEntryStepId,
  setSelectedNodeId,
  setSelectedEdgeId,
  commit,
}: Options): StepMutationControls => {
  const selectedStep = useMemo<TemplateStepDraft | null>(() => {
    if (!selectedNodeId) return null;
    const n = nodes.find((x) => x.id === selectedNodeId);
    return n ? (n.data as unknown as TemplateStepDraft) : null;
  }, [nodes, selectedNodeId]);

  const selectedEdgeInfo = useMemo<SelectedEdgeInfo | null>(() => {
    if (!selectedEdgeId) return null;
    const e = edges.find((x) => x.id === selectedEdgeId);
    if (!e) return null;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      isLoop: (e.data as EdgeData | undefined)?.isLoop ?? false,
    };
  }, [edges, selectedEdgeId]);

  const updateSelectedStep = useCallback(
    (next: TemplateStepDraft) => {
      // Rafale d'édition inspecteur sur le même step → une seule entrée.
      commit({ coalesceKey: `stepcfg:${selectedNodeId}` });
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== selectedNodeId) return n;
          const prev = n.data as unknown as TemplateStepDraft & {
            isEntry: boolean;
          };
          if (next.id !== prev.id) {
            if (entryStepId === prev.id) setEntryStepId(next.id);
            setEdges((eds) =>
              eds.map((e) => ({
                ...e,
                source: e.source === prev.id ? next.id : e.source,
                target: e.target === prev.id ? next.id : e.target,
              })),
            );
            setSelectedNodeId(next.id);
            return {
              ...n,
              id: next.id,
              data: { ...next, isEntry: prev.isEntry },
            };
          }
          return { ...n, data: { ...next, isEntry: prev.isEntry } };
        }),
      );
    },
    // Les setters (`setNodes`, `setEdges`, …) sont des props stables ; listés
    // pour satisfaire exhaustive-deps sans changer la fréquence de recréation.
    [entryStepId, selectedNodeId, setNodes, setEdges, setEntryStepId, setSelectedNodeId, commit],
  );

  const deleteSelectedStep = useCallback(() => {
    if (!selectedNodeId) return;
    commit();
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      ),
    );
    if (entryStepId === selectedNodeId) setEntryStepId(null);
    setSelectedNodeId(null);
  }, [entryStepId, selectedNodeId, setNodes, setEdges, setEntryStepId, setSelectedNodeId, commit]);

  const setSelectedAsEntry = useCallback(() => {
    if (!selectedNodeId) return;
    commit();
    const next = entryStepId === selectedNodeId ? null : selectedNodeId;
    setEntryStepId(next);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...(n.data as object), isEntry: n.id === next },
      })),
    );
  }, [entryStepId, selectedNodeId, setEntryStepId, setNodes, commit]);

  const toggleSelectedEdgeLoop = useCallback(() => {
    if (!selectedEdgeId) return;
    commit();
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id !== selectedEdgeId) return e;
        const next = !((e.data as EdgeData | undefined)?.isLoop ?? false);
        const sourceKind = nodes.find((n) => n.id === e.source)?.data?.kind;
        const isAutoLoop =
          next && AUTO_LOOP_SOURCE_KINDS.has((sourceKind as string) ?? "");
        return { ...e, data: { isLoop: next }, ...edgeStyle(next, isAutoLoop) };
      }),
    );
  }, [selectedEdgeId, setEdges, nodes, commit]);

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    commit();
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  }, [selectedEdgeId, setEdges, setSelectedEdgeId, commit]);

  return {
    selectedStep,
    selectedEdgeInfo,
    updateSelectedStep,
    deleteSelectedStep,
    setSelectedAsEntry,
    toggleSelectedEdgeLoop,
    deleteSelectedEdge,
  };
};
