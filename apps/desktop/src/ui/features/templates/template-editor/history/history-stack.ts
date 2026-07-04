/**
 * Cœur **pur** de l'historique undo/redo : un modèle `past` / `future` classique
 * (le `present` vit hors de ce module, dans un ref du hook) plus les métadonnées
 * de coalescing et un slot `pending` pour les gestes transactionnels.
 *
 * Toutes les fonctions sont pures : elles reçoivent l'horloge (`now`) en
 * paramètre — aucun accès à `Date.now()` ici — et ne mutent jamais l'état
 * d'entrée. Testables sans monter de composant (cf. history-stack.test.ts).
 */
import { docKey } from "./normalize-doc";
import type { EditorDoc } from "./editor-doc";

/** Profondeur max de la pile `past` — drop FIFO du plus ancien au-delà. */
export const HISTORY_LIMIT = 100;
/** Fenêtre de coalescing des rafales (frappe inspecteur / note / label). */
export const COALESCE_MS = 600;

export type HistoryState = {
  readonly past: readonly EditorDoc[];
  readonly future: readonly EditorDoc[];
  /** Clé de coalescing du dernier push (ou `null` si non coalescé). */
  readonly lastCoalesceKey: string | null;
  /** Horodatage du dernier push coalescé — borne la fenêtre. */
  readonly lastCommitTime: number;
  /** Snapshot capturé par `begin`, en attente de `settle` (gestes). */
  readonly pending: EditorDoc | null;
};

export const initialHistory: HistoryState = {
  past: [],
  future: [],
  lastCoalesceKey: null,
  lastCommitTime: 0,
  pending: null,
};

export const canUndo = (state: HistoryState): boolean => state.past.length > 0;
export const canRedo = (state: HistoryState): boolean =>
  state.future.length > 0;

/** Empile `doc` sur `past` en respectant le cap (drop FIFO du plus ancien). */
const pushPast = (
  past: readonly EditorDoc[],
  doc: EditorDoc,
): readonly EditorDoc[] => {
  const next = [...past, doc];
  return next.length > HISTORY_LIMIT
    ? next.slice(next.length - HISTORY_LIMIT)
    : next;
};

const topKeyOf = (past: readonly EditorDoc[]): string | null =>
  past.length > 0 ? docKey(past[past.length - 1]) : null;

/**
 * `commit` : empile le `present` (état **pré-mutation**) sur `past` et vide
 * `future`. Deux cas de **saut** :
 *   - **dédup no-op** : `present` identique au sommet de `past` (ex. deux commits
 *     dans le même tick, Delete sur rien) → aucun changement ;
 *   - **coalescing** : même `coalesceKey` que le dernier push et dans la fenêtre
 *     `COALESCE_MS` → on ne ré-empile pas, on fait juste glisser la fenêtre pour
 *     qu'une rafale continue reste **une** entrée.
 */
export const commitHistory = (
  state: HistoryState,
  present: EditorDoc,
  opts: { coalesceKey?: string; now: number },
): HistoryState => {
  const topKey = topKeyOf(state.past);
  if (topKey !== null && docKey(present) === topKey) return state;

  const coalesces =
    opts.coalesceKey !== undefined &&
    opts.coalesceKey === state.lastCoalesceKey &&
    opts.now - state.lastCommitTime < COALESCE_MS;
  if (coalesces) {
    return { ...state, lastCommitTime: opts.now };
  }

  return {
    past: pushPast(state.past, present),
    future: [],
    lastCoalesceKey: opts.coalesceKey ?? null,
    lastCommitTime: opts.now,
    pending: state.pending,
  };
};

/** `begin` : capture le `present` pré-geste, en attente de `settle`. */
export const beginHistory = (
  state: HistoryState,
  present: EditorDoc,
): HistoryState => ({ ...state, pending: present });

/**
 * `settle` : dénoue une transaction. `keep === true` empile le `pending`
 * (avec dédup + cap), `keep === false` le jette. Dans les deux cas `pending`
 * repart à `null`.
 */
export const settleHistory = (
  state: HistoryState,
  opts: { keep: boolean; now: number },
): HistoryState => {
  const pending = state.pending;
  if (!opts.keep || pending === null) {
    return { ...state, pending: null };
  }
  const topKey = topKeyOf(state.past);
  if (topKey !== null && docKey(pending) === topKey) {
    return { ...state, pending: null };
  }
  return {
    past: pushPast(state.past, pending),
    future: [],
    lastCoalesceKey: null,
    lastCommitTime: opts.now,
    pending: null,
  };
};

/** Résultat d'un `undo`/`redo` : nouvel état + doc à ré-appliquer (`null` si
 * seules des frames fantômes ont été consommées → rien à ré-appliquer). */
export type HistoryStep = {
  readonly state: HistoryState;
  readonly restored: EditorDoc | null;
};

/**
 * `undo` : remonte le premier sommet de `past` **sémantiquement différent** du
 * `present` en doc restauré, en poussant l'ancien `present` en tête de `future`.
 *
 * Garde anti-no-op : les frames « fantômes » en sommet — un doc `docKey`-égal au
 * `present` — sont **pelées et jetées** avant restauration. Elles sont empilées
 * par une commande à delta nul dont l'issue n'est pas connue au moment du
 * `commit` (un drag ramené dans la même cellule au snap, un auto-layout d'un
 * graphe déjà rangé, une frappe inspecteur retapée à l'identique dans la fenêtre
 * de coalescing…) : `commitHistory` ne dédoublonne que contre le sommet de
 * `past`, jamais contre le `present` *après* mutation, donc ces frames
 * survivent. Sans ce garde, `undo` restaurerait un doc identique au present →
 * aucun mouvement visible, d'où le « il faut appuyer plusieurs fois ». On les
 * consomme donc de façon transparente en un seul appel.
 *
 * Retourne `null` si rien n'a bougé (aucune frame réelle ni fantôme) ;
 * `{ restored: null }` si seules des frames fantômes ont été pelées (rien de
 * réel à restaurer, mais l'état est élagué pour que `canUndo` dise vrai).
 */
export const undoHistory = (
  state: HistoryState,
  present: EditorDoc,
): HistoryStep | null => {
  const presentKey = docKey(present);
  let past = state.past;
  while (past.length > 0 && docKey(past[past.length - 1]) === presentKey) {
    past = past.slice(0, -1);
  }
  if (past.length === 0) {
    if (past === state.past) return null;
    return {
      restored: null,
      state: { ...state, past, lastCoalesceKey: null, pending: null },
    };
  }
  const restored = past[past.length - 1];
  return {
    restored,
    state: {
      ...state,
      past: past.slice(0, -1),
      future: [present, ...state.future],
      lastCoalesceKey: null,
      pending: null,
    },
  };
};

/**
 * `redo` : symétrique — descend la première tête de `future` différente du
 * `present` en doc restauré, en ré-empilant l'ancien `present` sur `past`. Pèle
 * de même les têtes fantômes `docKey`-égales au present (cf. `undoHistory`).
 * `null` si rien à rétablir.
 */
export const redoHistory = (
  state: HistoryState,
  present: EditorDoc,
): HistoryStep | null => {
  const presentKey = docKey(present);
  let future = state.future;
  while (future.length > 0 && docKey(future[0]) === presentKey) {
    future = future.slice(1);
  }
  if (future.length === 0) {
    if (future === state.future) return null;
    return {
      restored: null,
      state: { ...state, future, lastCoalesceKey: null, pending: null },
    };
  }
  const [restored, ...rest] = future;
  return {
    restored,
    state: {
      ...state,
      past: pushPast(state.past, present),
      future: rest,
      lastCoalesceKey: null,
      pending: null,
    },
  };
};
