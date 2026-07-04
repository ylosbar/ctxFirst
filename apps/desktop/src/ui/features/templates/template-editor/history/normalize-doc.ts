/**
 * Normalisation (pure) d'un `EditorDoc` avant snapshot ou comparaison.
 *
 * Retire les champs **transients** pour que (a) l'égalité de deux docs soit
 * *sémantique* et (b) un annuler/rétablir ne rejoue pas d'animation ni ne fige
 * une sélection périmée :
 *   - `node.selected` / `node.dragging` — état d'interaction, jamais du document ;
 *   - `data.justDropped` — burst d'ajout ([useCanvasHandlers] `addStep`) ;
 *   - `data.isDrawing` — groupe en cours de tracé ([useGroupTools]) ;
 *   - `edge.selected`.
 *
 * **Conservé** : `position`, `parentId`, `width`/`height`/`measured`, `type`,
 * `zIndex`, le reste de `data` — les positions ET dimensions de groupe/note
 * *sont* du document (un resize est undoable), et garder `measured` évite un
 * reflow visuel à la restauration.
 *
 * Filtre défensif `!isSyntheticId(id)` : l'état `nodes`/`edges` n'en contient
 * déjà pas (les synthétiques ne vivent que dans `displayNodes`), mais on
 * re-filtre par prudence.
 */
import type { Edge, Node } from "@xyflow/react";

import { isSyntheticId } from "../graph/ids";
import type { EditorDoc } from "./editor-doc";

export const stripNode = (n: Node): Node => {
  const { selected: _selected, dragging: _dragging, ...rest } = n;
  const data = n.data as Record<string, unknown> | undefined;
  if (data && ("justDropped" in data || "isDrawing" in data)) {
    const { justDropped: _justDropped, isDrawing: _isDrawing, ...cleanData } =
      data;
    return { ...rest, data: cleanData };
  }
  return rest;
};

export const stripEdge = (e: Edge): Edge => {
  const { selected: _selected, ...rest } = e;
  return rest;
};

export const normalizeDoc = (doc: EditorDoc): EditorDoc => ({
  nodes: doc.nodes.filter((n) => !isSyntheticId(n.id)).map(stripNode),
  edges: doc.edges.filter((e) => !isSyntheticId(e.id)).map(stripEdge),
  entryStepId: doc.entryStepId,
  variables: doc.variables,
});

/**
 * Clé d'égalité sémantique d'un document — sérialisation du doc normalisé.
 * Les objets sont construits par spread cohérent côté commandes, donc l'ordre
 * des clés est stable ; suffisant pour le dédoublonnage à la fréquence d'une
 * action utilisateur (cf. §Normalisation).
 */
export const docKey = (doc: EditorDoc): string =>
  JSON.stringify(normalizeDoc(doc));
