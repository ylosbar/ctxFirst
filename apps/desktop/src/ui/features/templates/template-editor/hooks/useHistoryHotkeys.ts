/**
 * Raccourcis clavier undo/redo de l'éditeur de templates.
 *
 * Bindings : `(meta|ctrl)+z` → undo ; `(meta|ctrl)+shift+z` **ou** `ctrl+y`
 * → redo. Calqué sur le pattern `window.addEventListener("keydown", …)` des
 * hooks voisins ([useCanvasMode], [useMaximize]).
 *
 * Gardes :
 *   - **champ éditable** : si le focus est dans un `<input>` / `<textarea>` /
 *     `<select>` / `isContentEditable`, on laisse l'undo texte natif (inspecteur,
 *     titre, modales) ;
 *   - **view-run** : inerte en lecture seule ;
 *   - **scoping multi-onglets** : ne traite que si le focus est *dans* la racine
 *     `data-template-editor` de cet éditeur (le pane React Flow, focusable, y
 *     tombe quand l'utilisateur interagit avec ce canvas).
 *
 * La classification de la touche et la détection d'un champ éditable sont des
 * fonctions **pures** exportées et testées (useHistoryHotkeys.test.ts).
 */
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export type HistoryHotkey = "undo" | "redo" | null;

/** Descripteur minimal d'un évènement clavier — testable sans DOM. */
type KeyLike = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
};

export const classifyHistoryKey = (e: KeyLike): HistoryHotkey => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  // `Ctrl+Y` (Windows/Linux) — pas `Cmd+Y` (autre rôle sur macOS).
  if (key === "y" && e.ctrlKey && !e.metaKey) return "redo";
  return null;
};

/** `true` si l'élément focalisé possède son propre undo texte natif. */
export const isEditableTarget = (
  el: { tagName?: string; isContentEditable?: boolean } | null,
): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable === true;
};

type Options = {
  rootRef: RefObject<HTMLElement | null>;
  undo: () => void;
  redo: () => void;
  isViewRun: boolean;
};

export const useHistoryHotkeys = ({
  rootRef,
  undo,
  redo,
  isViewRun,
}: Options): void => {
  // Les callbacks changent d'identité à chaque render (canUndo/canRedo) mais on
  // ne veut pas ré-attacher le listener global à chaque fois : on les lit via
  // des refs, le listener reste monté une seule fois.
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const isViewRunRef = useRef(isViewRun);
  isViewRunRef.current = isViewRun;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isViewRunRef.current) return;
      const action = classifyHistoryKey(e);
      if (!action) return;
      const active = document.activeElement;
      if (isEditableTarget(active)) return;
      const root = rootRef.current;
      if (!root || !root.contains(active)) return;
      e.preventDefault();
      if (action === "undo") undoRef.current();
      else redoRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rootRef]);
};
