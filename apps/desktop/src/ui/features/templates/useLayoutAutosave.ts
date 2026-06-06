/**
 * Debounced auto-save du layout d'éditeur de template (positions + viewport).
 *
 * Déclencheurs : fin de drag d'un node (`onNodeDragStop`) et fin de pan/zoom
 * du canvas (`onMoveEnd`). On capture le commit du mouvement — pas chaque
 * tick — et on regroupe les évènements sur ~500 ms. La sauvegarde est
 * désactivée tant qu'il n'existe pas de ligne `(id, version)` cible
 * (`templateRef === null`) ou tant qu'une sauvegarde manuelle est en cours.
 */
import { useCallback, useEffect, useRef } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import type { TemplateLayout } from "@shared/wf/layout";

import { buildTemplateLayout } from "./template-editor/graph/build-layout";

const DEBOUNCE_MS = 500;

type Options = {
  /** `null` quand le template n'a pas encore de ligne en base (création). */
  templateRef: string | null;
  /** `true` quand la sauvegarde manuelle du template est en cours. */
  busy: boolean;
  /** Nodes courants ; les ids synthétiques sont filtrés via `isSynthetic`. */
  nodes: ReadonlyArray<Node>;
  isSynthetic: (id: string) => boolean;
  save: (templateRef: string, layout: TemplateLayout) => Promise<void>;
  onError?: (e: unknown) => void;
};

export type LayoutAutosaveControls = {
  /** À brancher sur `<ReactFlow onNodeDragStop={…}>`. */
  onNodeDragStop: () => void;
  /** À brancher sur `<ReactFlow onMoveEnd={…}>`. */
  onMoveEnd: () => void;
  /**
   * Programme une sauvegarde debounced (~500 ms). À appeler après une mutation
   * programmatique des positions (ex : auto-layout) — le délai laisse le temps
   * au re-render React de propager les nouvelles positions au hook avant le flush.
   */
  scheduleSave: () => void;
  /** Force le flush immédiat (utile pour un cleanup au unmount). */
  flushNow: () => Promise<void>;
};

export const useLayoutAutosave = ({
  templateRef,
  busy,
  nodes,
  isSynthetic,
  save,
  onError,
}: Options): LayoutAutosaveControls => {
  const rf = useReactFlow();
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const refRef = useRef(templateRef);
  refRef.current = templateRef;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const isSyntheticRef = useRef(isSynthetic);
  isSyntheticRef.current = isSynthetic;
  const saveRef = useRef(save);
  saveRef.current = save;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildLayout = useCallback(
    (): TemplateLayout =>
      buildTemplateLayout(nodesRef.current, {
        viewport: rf.getViewport(),
        updatedAt: new Date().toISOString(),
        isSynthetic: isSyntheticRef.current,
      }),
    [rf],
  );

  const flushNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ref = refRef.current;
    if (!ref) return;
    if (busyRef.current) return;
    try {
      await saveRef.current(ref, buildLayout());
    } catch (e) {
      onErrorRef.current?.(e);
    }
  }, [buildLayout]);

  const schedule = useCallback(() => {
    if (!refRef.current) return;
    if (busyRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushNow();
    }, DEBOUNCE_MS);
  }, [flushNow]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  return {
    onNodeDragStop: schedule,
    onMoveEnd: schedule,
    scheduleSave: schedule,
    flushNow,
  };
};
