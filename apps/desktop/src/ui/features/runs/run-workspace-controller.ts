import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type {
  GroupImperativeHandle,
  PanelImperativeHandle,
} from "react-resizable-panels";
import { defaultGroupLayouts } from "./run-workspace-layout";

// Spec runs-unified-resizable-workspace.md §6.2/§6.3 — détient les refs
// impératives des groupes/panneaux react-resizable-panels et l'état replié.
// Partagé entre l'arbre de split (RunWorkspaceSplit) et la barre d'outils du
// panel (menu zones, « Réinitialiser la disposition »).
export type LayoutController = {
  readonly registerPanel: (id: string, h: PanelImperativeHandle | null) => void;
  readonly registerGroup: (id: string, h: GroupImperativeHandle | null) => void;
  readonly collapsed: Readonly<Record<string, boolean>>;
  readonly notifyCollapsed: (id: string, collapsed: boolean) => void;
  readonly toggle: (id: string) => void;
  readonly reset: () => void;
};

const LayoutCtx = createContext<LayoutController | null>(null);

export const LayoutProvider = LayoutCtx.Provider;

export const useLayoutController = (): LayoutController => {
  const ctx = useContext(LayoutCtx);
  if (!ctx) throw new Error("RunWorkspaceSplit must be used within its controller");
  return ctx;
};

export const useRunWorkspaceController = (): LayoutController => {
  const panels = useRef(new Map<string, PanelImperativeHandle>());
  const groups = useRef(new Map<string, GroupImperativeHandle>());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const registerPanel = useCallback(
    (id: string, h: PanelImperativeHandle | null) => {
      if (h) panels.current.set(id, h);
      else panels.current.delete(id);
    },
    [],
  );
  const registerGroup = useCallback(
    (id: string, h: GroupImperativeHandle | null) => {
      if (h) groups.current.set(id, h);
      else groups.current.delete(id);
    },
    [],
  );
  const notifyCollapsed = useCallback((id: string, value: boolean) => {
    setCollapsed((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);
  const toggle = useCallback((id: string) => {
    const panel = panels.current.get(id);
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, []);
  const reset = useCallback(() => {
    for (const [groupId, layout] of defaultGroupLayouts()) {
      groups.current.get(groupId)?.setLayout(layout);
    }
    for (const panel of panels.current.values()) {
      if (panel.isCollapsed()) panel.expand();
    }
    setCollapsed({});
  }, []);

  return useMemo(
    () => ({
      registerPanel,
      registerGroup,
      collapsed,
      notifyCollapsed,
      toggle,
      reset,
    }),
    [registerPanel, registerGroup, collapsed, notifyCollapsed, toggle, reset],
  );
};
