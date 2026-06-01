import { useEffect, type ReactNode } from "react";
import { prunePrefsAgainstRegistry, useWorkbenchStore } from "./store";

// Workbench is backed by a Zustand store, so there is no React context to
// provide. The Provider component is kept as a lifecycle boundary: it re-prunes
// prefs against the registry on mount (safety net for HMR/late registrations)
// and disposes the dockview wiring on unmount.
const WorkbenchProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    prunePrefsAgainstRegistry();
    return () => {
      useWorkbenchStore.getState().disposeDockviewApi();
    };
  }, []);
  return <>{children}</>;
};

export default WorkbenchProvider;

export {
  useWorkbench,
  useWorkbenchState,
  useActiveEditor,
  useActiveActivity,
  useWorkbenchPrefs,
  useEditors,
  useDockviewReady,
  useWorkbenchStore,
  WORKBENCH_TAB_COMPONENT,
  workbenchTabComponentForType,
} from "./store";
export type { EditorPanelParams, WorkbenchState } from "./store";
