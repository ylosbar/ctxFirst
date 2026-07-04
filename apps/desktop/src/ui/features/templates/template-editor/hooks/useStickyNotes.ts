/**
 * Notes post-it du canvas (spec template-sticky-notes).
 *
 * Données purement présentationnelles, persistées dans le layout via l'autosave
 * debounced. Expose l'action d'ajout (`addStickyNote`, centrée sur la vue) et
 * le bundle `stickyActions` consommé par le `StickyNoteActionsProvider`
 * (édition de texte, suppression, fin de resize, flush au blur).
 */
import { useCallback, useMemo } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Node, ReactFlowInstance } from "@xyflow/react";

import type { LayoutAutosaveControls } from "../../useLayoutAutosave";
import { STICKY_NODE_PREFIX, highestCounterForKind } from "../graph/ids";

type StickyActions = {
  onTextChange: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  /** Snapshot d'historique en début de resize (une entrée par geste). */
  onResizeStart: (id: string) => void;
  onResizeEnd: () => void;
  onCommit: () => void;
  readOnly: boolean;
};

type Options = {
  nodes: Node[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  screenToFlowPosition: ReactFlowInstance["screenToFlowPosition"];
  flowWrapperRef: RefObject<HTMLDivElement | null>;
  layoutAutosave: LayoutAutosaveControls;
  isViewRun: boolean;
  /** Snapshot d'historique (undoable) posé avant chaque mutation de note. */
  commit: (opts?: { coalesceKey?: string }) => void;
};

export type StickyNotesControls = {
  /** À brancher sur le bouton « ajouter une note » de la toolbar. */
  addStickyNote: () => void;
  /** Bundle pour le `StickyNoteActionsProvider`. */
  stickyActions: StickyActions;
};

export const useStickyNotes = ({
  nodes,
  setNodes,
  screenToFlowPosition,
  flowWrapperRef,
  layoutAutosave,
  isViewRun,
  commit,
}: Options): StickyNotesControls => {
  const addStickyNote = useCallback(() => {
    commit();
    // Id stable et unique parmi les notes existantes (pas de `Date.now()` —
    // garde l'idempotence et évite la collision avec une note rechargée).
    const maxNote = highestCounterForKind(
      "note",
      nodes.filter((n) => n.type === "stickyNote").map((n) => n.id),
    );
    const id = `${STICKY_NODE_PREFIX}${maxNote + 1}`;
    const W = 200;
    const H = 140;
    const wrapper = flowWrapperRef.current;
    const center = wrapper
      ? (() => {
          const rect = wrapper.getBoundingClientRect();
          return screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        })()
      : { x: 80 + W / 2, y: 80 + H / 2 };
    const newNote: Node = {
      id,
      type: "stickyNote",
      position: { x: center.x - W / 2, y: center.y - H / 2 },
      width: W,
      height: H,
      data: { text: "", color: "yellow" },
      zIndex: -1,
    };
    setNodes((nds) => [...nds, newNote]);
    layoutAutosave.scheduleSave();
  }, [nodes, screenToFlowPosition, flowWrapperRef, setNodes, layoutAutosave, commit]);

  const onStickyTextChange = useCallback(
    (id: string, text: string) => {
      // Rafale de frappe sur la même note → une seule entrée (coalescée).
      commit({ coalesceKey: `sticky:${id}` });
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...(n.data ?? {}), text } } : n,
        ),
      );
      layoutAutosave.scheduleSave();
    },
    [setNodes, layoutAutosave, commit],
  );

  const onStickyDelete = useCallback(
    (id: string) => {
      commit();
      setNodes((nds) => nds.filter((n) => n.id !== id));
      layoutAutosave.scheduleSave();
    },
    [setNodes, layoutAutosave, commit],
  );

  // Une entrée par geste de resize : snapshot avant la première frame. Le
  // NodeResizer émet ensuite des changements de dimensions (via `onNodesChange`)
  // qui ne committent pas — ils sont capturés par ce snapshot de tête.
  const onStickyResizeStart = useCallback(
    (_id: string) => {
      commit();
    },
    [commit],
  );

  const onStickyResizeEnd = useCallback(() => {
    // NodeResizer ne déclenche pas `onNodeDragStop` : on programme le save
    // explicitement pour persister les nouvelles dimensions.
    layoutAutosave.scheduleSave();
  }, [layoutAutosave]);

  const stickyActions = useMemo<StickyActions>(
    () => ({
      onTextChange: onStickyTextChange,
      onDelete: onStickyDelete,
      onResizeStart: onStickyResizeStart,
      onResizeEnd: onStickyResizeEnd,
      // Flush au blur du textarea : si l'éditeur est fermé < 500 ms après la
      // dernière frappe, le timer debounce serait annulé au unmount sans ça.
      onCommit: () => void layoutAutosave.flushNow(),
      readOnly: isViewRun,
    }),
    [
      onStickyTextChange,
      onStickyDelete,
      onStickyResizeStart,
      onStickyResizeEnd,
      layoutAutosave,
      isViewRun,
    ],
  );

  return { addStickyNote, stickyActions };
};
