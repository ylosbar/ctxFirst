/**
 * Historique undo/redo de l'éditeur de templates — modèle « commit explicite ».
 *
 * Chaque commande utilisateur appelle `commit()` **en tête**, avant de muter
 * l'un des quatre atomes (`nodes`/`edges`/`entryStepId`/`variables`). Comme le
 * flow React Flow est entièrement contrôlé, restaurer un snapshot = trois/quatre
 * `setState` ; React Flow réconcilie et `useDisplayGraph` re-dérive seul. Zéro
 * nouvelle source de vérité : l'historique est un dérivé des setters existants.
 *
 * Mécanique (cf. spec template-editor-undo-redo §API du hook) :
 *   - un **`presentRef`** miroir réassigné à chaque render tient l'état courant ;
 *     `commit()` étant appelé *avant* le setter de la commande, `presentRef`
 *     contient encore l'état **pré-mutation** → c'est lui qu'on empile ;
 *   - `past`/`future`/`pending`/coalescing vivent dans un **ref** (pas de
 *     re-render sur push) ; seuls `canUndo`/`canRedo` sont du `useState` ;
 *   - `undo`/`redo` réassignent `presentRef.current` **synchronement** (pour
 *     survivre à deux annulers dans le même tick) puis appliquent via les setters
 *     + `clearSelection()` + `scheduleLayoutSave()` ;
 *   - en `isViewRun`, toute l'API est no-op.
 */
import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

import type { TemplateVariableDraft } from "../../../../../domain/workflow/types";
import type { EditorDoc } from "../history/editor-doc";
import {
  beginHistory,
  canRedo as canRedoOf,
  canUndo as canUndoOf,
  commitHistory,
  initialHistory,
  redoHistory,
  settleHistory,
  undoHistory,
  type HistoryState,
} from "../history/history-stack";

export type EditorHistory = {
  /** Snapshote l'état **pré-mutation** ; à appeler en tête de chaque commande. */
  commit: (opts?: { coalesceKey?: string }) => void;
  /** Capture le present avant un geste qui pollue `nodes` (dessin de groupe). */
  begin: () => void;
  /** Dénoue le geste : empile le pending (`keep`) ou le jette. */
  settle: (keep: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Vide les deux piles (load / reload / changement de template). */
  reset: () => void;
};

type Options = {
  nodes: Node[];
  edges: Edge[];
  entryStepId: string | null;
  variables: readonly TemplateVariableDraft[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setEntryStepId: Dispatch<SetStateAction<string | null>>;
  setVariables: Dispatch<SetStateAction<readonly TemplateVariableDraft[]>>;
  clearSelection: () => void;
  scheduleLayoutSave: () => void;
  isViewRun: boolean;
};

export const useEditorHistory = ({
  nodes,
  edges,
  entryStepId,
  variables,
  setNodes,
  setEdges,
  setEntryStepId,
  setVariables,
  clearSelection,
  scheduleLayoutSave,
  isViewRun,
}: Options): EditorHistory => {
  // Miroir du document courant, réassigné à chaque render (même pattern que
  // `nodesRef.current = nodes`). `commit()` appelé avant le setter de la
  // commande y lit donc l'état pré-mutation.
  const presentRef = useRef<EditorDoc>({ nodes, edges, entryStepId, variables });
  presentRef.current = { nodes, edges, entryStepId, variables };

  const stateRef = useRef<HistoryState>(initialHistory);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Les callbacks doivent rester référentiellement stables (deps vides) : on lit
  // `isViewRun` et les setters via refs/closure stable. Seul `canUndo/canRedo`
  // change → re-render.
  const isViewRunRef = useRef(isViewRun);
  isViewRunRef.current = isViewRun;

  const syncFlags = useCallback(() => {
    setCanUndo(canUndoOf(stateRef.current));
    setCanRedo(canRedoOf(stateRef.current));
  }, []);

  const commit = useCallback(
    (opts?: { coalesceKey?: string }) => {
      if (isViewRunRef.current) return;
      const next = commitHistory(stateRef.current, presentRef.current, {
        coalesceKey: opts?.coalesceKey,
        now: Date.now(),
      });
      if (next === stateRef.current) return;
      stateRef.current = next;
      syncFlags();
    },
    [syncFlags],
  );

  const begin = useCallback(() => {
    if (isViewRunRef.current) return;
    stateRef.current = beginHistory(stateRef.current, presentRef.current);
  }, []);

  const settle = useCallback(
    (keep: boolean) => {
      if (isViewRunRef.current) return;
      stateRef.current = settleHistory(stateRef.current, {
        keep,
        now: Date.now(),
      });
      syncFlags();
    },
    [syncFlags],
  );

  // Restaure un document via les setters. Réassigne `presentRef` en amont pour
  // qu'un second undo/redo dans le même tick parte du bon état.
  const apply = useCallback(
    (doc: EditorDoc) => {
      presentRef.current = doc;
      setNodes(doc.nodes as Node[]);
      setEdges(doc.edges as Edge[]);
      setEntryStepId(doc.entryStepId);
      setVariables(doc.variables);
      clearSelection();
      scheduleLayoutSave();
    },
    [
      setNodes,
      setEdges,
      setEntryStepId,
      setVariables,
      clearSelection,
      scheduleLayoutSave,
    ],
  );

  const undo = useCallback(() => {
    if (isViewRunRef.current) return;
    const res = undoHistory(stateRef.current, presentRef.current);
    if (!res) return;
    stateRef.current = res.state;
    // `restored === null` : seules des frames fantômes (docKey-égales au present)
    // ont été pelées → rien à ré-appliquer, on met juste à jour les flags.
    if (res.restored) apply(res.restored);
    syncFlags();
  }, [apply, syncFlags]);

  const redo = useCallback(() => {
    if (isViewRunRef.current) return;
    const res = redoHistory(stateRef.current, presentRef.current);
    if (!res) return;
    stateRef.current = res.state;
    if (res.restored) apply(res.restored);
    syncFlags();
  }, [apply, syncFlags]);

  const reset = useCallback(() => {
    stateRef.current = initialHistory;
    syncFlags();
  }, [syncFlags]);

  return { commit, begin, settle, undo, redo, canUndo, canRedo, reset };
};
