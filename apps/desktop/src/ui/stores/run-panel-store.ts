import { useContext, useEffect } from "react";
import { create } from "zustand";
import { useActiveEditor } from "../workbench/WorkbenchProvider";
import { RUN_URI_PREFIX } from "../features/runs/run-uri";
import {
  RunPanelContext,
  type RunPanelContextValue,
} from "../features/runs/run-panel-context";

type RunPanelState = {
  readonly handles: ReadonlyMap<string, RunPanelContextValue>;
  readonly upsert: (uri: string, handle: RunPanelContextValue) => void;
  readonly remove: (uri: string) => void;
};

export const useRunPanelStore = create<RunPanelState>((set) => ({
  handles: new Map(),
  upsert: (uri, handle) =>
    set((s) => {
      const next = new Map(s.handles);
      next.set(uri, handle);
      return { handles: next };
    }),
  remove: (uri) =>
    set((s) => {
      if (!s.handles.has(uri)) return s;
      const next = new Map(s.handles);
      next.delete(uri);
      return { handles: next };
    }),
}));

// Publishes the live `handle` of the run editor at `uri`. Sidebar views read
// from the active editor's handle instead of relying on a React context, so
// they can render outside the editor's subtree (in the secondary sidebar).
export const useRegisterRunPanel = (
  uri: string,
  handle: RunPanelContextValue | null,
): void => {
  useEffect(() => {
    if (!handle) return;
    useRunPanelStore.getState().upsert(uri, handle);
  }, [uri, handle]);
  useEffect(() => {
    return () => useRunPanelStore.getState().remove(uri);
  }, [uri]);
};

export const useRunPanel = (
  uri: string | null,
): RunPanelContextValue | null =>
  useRunPanelStore((s) => (uri ? s.handles.get(uri) ?? null : null));

export const useActiveRunPanel = (): RunPanelContextValue | null => {
  const activeEditor = useActiveEditor();
  const activeUri =
    activeEditor && activeEditor.uri.startsWith(RUN_URI_PREFIX)
      ? activeEditor.uri
      : null;
  return useRunPanel(activeUri);
};

// Spec runs-unified-resizable-workspace.md §6.5 — source de sélection du Run
// Workspace : lit le `RunPanelContext` fourni par le panel, et retombe sur la
// résolution via l'éditeur actif quand aucun provider n'englobe l'arbre. Les
// surfaces embarquées (Itérations, Artefact, Graphe, Stats, Timeline) basculent
// d'une source à l'autre sans changer leur corps.
export const useRunPanelContext = (): RunPanelContextValue | null => {
  const fromContext = useContext(RunPanelContext);
  const fromActive = useActiveRunPanel();
  return fromContext ?? fromActive;
};
