import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useWorkbench, useWorkbenchStore } from "./WorkbenchProvider";
import { workbenchRegistry } from "./registry";

// Bidirectional sync between the browser URL and the Workbench state, driven
// entirely by the registry (spec workbench audit H-3). Each
// ActivityContribution / EditorTypeContribution owns its own path↔uri mapping
// (`matchPath` / `toPath`), so a feature — or a plugin — routes itself without
// patching this file. The only behaviours that stay here are generic and
// scheme-agnostic: opaque transient paths, and the "don't reopen / don't
// downgrade" rules that keep singleton editors (e.g. Settings) stable.
const WorkbenchRouterSync = () => {
  const wb = useWorkbench();
  const location = useLocation();
  const navigate = useNavigate();
  const lastSyncedUrlRef = useRef<string | null>(null);

  // URL → Workbench
  useEffect(() => {
    const pathname = location.pathname;
    const key = `${pathname}${location.search}`;
    if (lastSyncedUrlRef.current === key) return;
    lastSyncedUrlRef.current = key;

    const activity = workbenchRegistry.activityForPath(pathname);
    if (activity && wb.activeActivity() !== activity.id) {
      wb.activateActivity(activity.id);
    }

    // Editor-less paths — activity landings (`/runs`) and transient/modal
    // routes (`/runs/new`, owned by RunsOverlay) — resolve to no URI, so
    // nothing opens.
    const uri = workbenchRegistry.uriForPath(pathname, location.search);
    if (uri) {
      const active = wb.activeEditor();
      if (!active || active.uri !== uri) {
        wb.openEditor(uri, { focus: true });
      }
    }
  }, [location.pathname, location.search, wb]);

  // Workbench → URL. Fires on active-editor OR active-activity change — the
  // latter fixes the case where switching activity with no editor open left the
  // URL stale (spec workbench audit H-3b).
  useEffect(() => {
    const run = () => {
      const currentUrl = lastSyncedUrlRef.current;

      // Opaque transient/modal path: an activity sub-path that maps to no
      // editor (e.g. `/runs/new`). Never navigate away — that would tear the
      // modal down. Generic replacement for the old hardcoded NEW_RUN_PATH guard.
      if (currentUrl) {
        const act = workbenchRegistry.activityForPath(currentUrl);
        if (
          act?.route &&
          currentUrl.startsWith(`${act.route}/`) &&
          !workbenchRegistry.uriForPath(currentUrl, "")
        ) {
          return;
        }
      }

      const active = wb.activeEditor();
      let desired: string | null;
      if (active) {
        desired = workbenchRegistry.pathForUri(active.uri);
        if (!desired) return;
        // The active editor owns a deeper URL variant (e.g. the settings
        // singleton lives at `/settings/<category>` though its URI is bare
        // `settings://`) — don't downgrade to the bare path it maps to.
        if (currentUrl && currentUrl.startsWith(`${desired}/`)) return;
      } else {
        const activityId = wb.activeActivity();
        const act = activityId
          ? workbenchRegistry.getActivity(activityId)
          : null;
        desired = act?.route ?? null;
        if (!desired) return;
        // The activity's landing route maps straight back to an editor (no list
        // surface — e.g. Settings): navigating there would reopen the editor the
        // user just closed. Leave the URL on its deeper path; the watermark
        // shows now that no editor remains. Activities with a real list surface
        // (Runs → `/runs`) map their route to no editor, so they DO navigate.
        if (workbenchRegistry.uriForPath(desired, "")) return;
      }

      if (currentUrl === desired) return;
      lastSyncedUrlRef.current = desired;
      void navigate(desired, { replace: true });
    };

    const unsubEditor = useWorkbenchStore.subscribe((s) => s.activeEditor, run);
    const unsubActivity = useWorkbenchStore.subscribe(
      (s) => s.activeActivity,
      run,
    );
    return () => {
      unsubEditor();
      unsubActivity();
    };
  }, [wb, navigate]);

  return null;
};

export default WorkbenchRouterSync;
