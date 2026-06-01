import { useEffect } from "react";
import { useNavigate } from "react-router";
import {
  useActiveActivity,
  useWorkbench,
} from "../../workbench/WorkbenchProvider";
import { instanceIdFromRunUri, RUN_URI_PREFIX } from "./run-uri";
import { usePinnedIds } from "../../stores/runs-store";
import { isEditableTarget } from "@/lib/dom/is-editable-target";

const RunsShortcuts = () => {
  const navigate = useNavigate();
  const wb = useWorkbench();
  const activeActivity = useActiveActivity();
  const pinnedIds = usePinnedIds();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey) return;

      // New run shortcut is global to the runs activity for now.
      if (event.key.toLowerCase() === "n" && !event.shiftKey) {
        if (activeActivity !== "runs") return;
        event.preventDefault();
        navigate("/runs/new");
        return;
      }

      // Cmd/Ctrl-W closing is owned by the Workbench shell (see
      // WorkbenchShortcuts). Pinned runs are the one exception — vetoed below.

      // Cmd/Ctrl-1..9: jump to nth run tab.
      if (/^[1-9]$/.test(event.key) && !event.shiftKey) {
        if (isEditableTarget(event.target)) return;
        const runs = wb.listEditors().filter((e) => e.uri.startsWith(RUN_URI_PREFIX));
        const idx = parseInt(event.key, 10) - 1;
        const target = runs[idx];
        if (!target) return;
        event.preventDefault();
        wb.openEditor(target.uri, { focus: true });
      }
    };
    // Veto Cmd/Ctrl-W when the active editor is a pinned run. Runs in the
    // capture phase so it pre-empts the Workbench's bubble-phase close handler.
    const pinnedCloseGuard = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "w") return;
      const active = wb.activeEditor();
      if (!active) return;
      const id = instanceIdFromRunUri(active.uri);
      if (!id || !pinnedIds.has(id)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    window.addEventListener("keydown", handler);
    window.addEventListener("keydown", pinnedCloseGuard, true);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keydown", pinnedCloseGuard, true);
    };
  }, [navigate, wb, activeActivity, pinnedIds]);

  return null;
};

export default RunsShortcuts;
