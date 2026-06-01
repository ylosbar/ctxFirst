import { useEffect } from "react";
import { isEditableTarget } from "@/lib/dom/is-editable-target";
import { useWorkbench } from "./WorkbenchProvider";
import { useWorkbenchStore } from "./store";
import { viewPanelId } from "./dock-panels";
import type { ViewId } from "./types";

// Global keybindings owned by the Workbench shell. Modeled after VSCode:
//   ⌘W / Ctrl+W      → close the active editor (any type)
//   ⌘B / Ctrl+B      → toggle primary sidebar
//   ⌘⌥B / Ctrl+Alt+B → toggle secondary sidebar
//   ⌘J / Ctrl+J      → toggle the global chat panel (right)
//   ⌘` / Ctrl+`      → toggle the terminal panel (bottom)
// Shift is reserved for future bindings (e.g. focus); we explicitly bail when
// it's pressed so we don't fire on ⇧⌘B combinations.

// Toggle helper for dock-hosted views. If the view is currently the active
// panel of its group, `hideView` it. Otherwise `showView` reveals/focuses it.
// Replaces the previous slot-host `prefs.*.activeViewByEditorType` reads —
// dockview is the source of truth for view focus now.
const toggleDockView = (id: ViewId): void => {
  const state = useWorkbenchStore.getState();
  const dv = state._dockviewApi;
  const panel = dv?.getPanel(viewPanelId(id));
  const isCurrentlyActive =
    panel && panel.group.activePanel?.id === panel.api.id;
  if (isCurrentlyActive) state.hideView(id);
  else state.showView(id);
};

const WorkbenchShortcuts = () => {
  const wb = useWorkbench();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "w" && !event.altKey) {
        // Close the active editor, whatever its type (run, template, artifact,
        // skill… and any future one). Fires even while focus is inside the
        // editor's own inputs, like VSCode — so it runs before the
        // isEditableTarget guard below. Features that need to veto the close
        // for a specific editor (e.g. pinned runs) do so in the capture phase
        // before this fires.
        const active = wb.activeEditor();
        if (!active) return;
        event.preventDefault();
        wb.closeEditor(active.uri);
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (key === "b") {
        event.preventDefault();
        if (event.altKey) wb.toggleSecondarySidebar();
        else wb.togglePrimarySidebar();
        return;
      }
      if (event.key === "`" && !event.altKey) {
        event.preventDefault();
        toggleDockView("terminal.devlog");
        return;
      }
      if (key === "j" && !event.altKey) {
        event.preventDefault();
        toggleDockView("chat.main");
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [wb]);
  return null;
};

export default WorkbenchShortcuts;
