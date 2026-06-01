import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useWorkbench } from "./WorkbenchProvider";

const ROOT_PATH = "/";
const OVERVIEW_PATH = "/overview";
const OVERVIEW_URI = "overview://";
const SKILLS_PREFIX = "/skills";
const SKILL_URI_PREFIX = "skill://";
const RUNS_PREFIX = "/runs";
const RUN_URI_PREFIX = "run://";
const NEW_RUN_PATH = "/runs/new";
const SCHEDULES_PREFIX = "/schedules";
const TEMPLATES_PREFIX = "/templates";
const TEMPLATES_LIST_URI = "templates://";
const TEMPLATE_URI_PREFIX = "template://";
const NEW_TEMPLATE_PATH = "/templates/new";
const NEW_TEMPLATE_URI = "template://new";
const SETTINGS_PREFIX = "/settings";
const SETTINGS_URI = "settings://";

const urlFromUri = (uri: string): string | null => {
  if (uri === OVERVIEW_URI) return OVERVIEW_PATH;
  if (uri === SETTINGS_URI) return SETTINGS_PREFIX;
  if (uri.startsWith(SKILL_URI_PREFIX)) {
    const ref = uri.slice(SKILL_URI_PREFIX.length);
    if (!ref) return SKILLS_PREFIX;
    return `${SKILLS_PREFIX}/${encodeURIComponent(ref)}`;
  }
  if (uri.startsWith(RUN_URI_PREFIX)) {
    const rest = uri.slice(RUN_URI_PREFIX.length);
    if (!rest) return RUNS_PREFIX;
    // Strip the optional `?step=` slot — the URL form doesn't carry it; deep
    // step focus is resolved by the editor from the URI itself.
    const qIdx = rest.indexOf("?");
    const id = qIdx === -1 ? rest : rest.slice(0, qIdx);
    if (!id) return RUNS_PREFIX;
    return `${RUNS_PREFIX}/${encodeURIComponent(id)}`;
  }
  if (uri === TEMPLATES_LIST_URI) return TEMPLATES_PREFIX;
  if (uri === NEW_TEMPLATE_URI || uri.startsWith(`${NEW_TEMPLATE_URI}?`)) {
    return NEW_TEMPLATE_PATH;
  }
  if (uri.startsWith(TEMPLATE_URI_PREFIX)) {
    const rest = uri.slice(TEMPLATE_URI_PREFIX.length);
    const ref = rest.split("?")[0];
    if (!ref || ref === "new") return NEW_TEMPLATE_PATH;
    return `${TEMPLATES_PREFIX}/${encodeURIComponent(ref)}/edit`;
  }
  return null;
};

const uriFromUrl = (
  pathname: string,
  search: string,
): string | null => {
  if (pathname === ROOT_PATH || pathname === "") return OVERVIEW_URI;
  if (pathname === OVERVIEW_PATH) return OVERVIEW_URI;
  if (pathname === SETTINGS_PREFIX || pathname.startsWith(`${SETTINGS_PREFIX}/`)) {
    return SETTINGS_URI;
  }
  const skillMatch = pathname.match(/^\/skills(?:\/(.+))?$/);
  if (skillMatch) {
    const ref = skillMatch[1];
    if (!ref) return null;
    return `${SKILL_URI_PREFIX}${decodeURIComponent(ref)}`;
  }
  const runMatch = pathname.match(/^\/runs\/([^/]+)$/);
  if (runMatch) {
    const id = runMatch[1];
    if (!id || id === "new") return null;
    return `${RUN_URI_PREFIX}${decodeURIComponent(id)}`;
  }
  if (pathname === TEMPLATES_PREFIX) return TEMPLATES_LIST_URI;
  if (pathname === NEW_TEMPLATE_PATH) {
    // Preserve `?from=ref` so duplications get a unique panel.
    return `${NEW_TEMPLATE_URI}${search ?? ""}`;
  }
  const tplEditMatch = pathname.match(/^\/templates\/([^/]+)\/edit$/);
  if (tplEditMatch) {
    return `${TEMPLATE_URI_PREFIX}${decodeURIComponent(tplEditMatch[1])}`;
  }
  return null;
};

const activityFromUrl = (pathname: string): string | null => {
  if (pathname === ROOT_PATH || pathname === "") return "overview";
  if (pathname === OVERVIEW_PATH) return "overview";
  if (pathname.startsWith(SKILLS_PREFIX)) return "skills";
  if (pathname.startsWith(RUNS_PREFIX)) return "runs";
  if (pathname.startsWith(SCHEDULES_PREFIX)) return "schedules";
  if (pathname.startsWith(TEMPLATES_PREFIX)) return "templates";
  if (pathname.startsWith(SETTINGS_PREFIX)) return "settings";
  return null;
};

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

    const activity = activityFromUrl(pathname);
    if (activity && wb.activeActivity() !== activity) {
      wb.activateActivity(activity);
    }

    // Don't open editors for the modal-only "new run" path.
    if (pathname === NEW_RUN_PATH) return;

    const uri = uriFromUrl(pathname, location.search);
    if (uri) {
      const active = wb.activeEditor();
      if (!active || active.uri !== uri) {
        wb.openEditor(uri, { focus: true });
      }
    }
  }, [location.pathname, location.search, wb]);

  // Workbench → URL
  useEffect(() => {
    return wb.subscribe("activeEditorChanged", () => {
      // Don't override modal route while it's open.
      if (lastSyncedUrlRef.current === NEW_RUN_PATH) return;
      const active = wb.activeEditor();
      let desired: string | null = null;
      if (active) {
        desired = urlFromUri(active.uri);
      } else {
        const activity = wb.activeActivity();
        if (activity === "overview") desired = OVERVIEW_PATH;
        else if (activity === "skills") desired = SKILLS_PREFIX;
        else if (activity === "runs") desired = RUNS_PREFIX;
        else if (activity === "schedules") desired = SCHEDULES_PREFIX;
        else if (activity === "templates") desired = TEMPLATES_PREFIX;
        else if (activity === "settings") {
          // The settings activity has no list surface — `/settings` maps
          // straight back to the singleton settings editor. Reaching this
          // branch means that editor was just closed (no active editor left).
          //
          // Re-deriving `/settings` here would re-open it: the URL→Workbench
          // effect resolves `/settings` to `settings://` and reopens the
          // panel, while the still-mounting SettingsEditor canonicalises
          // `/settings` → `/settings/<category>` — that race is why the close
          // X used to need several clicks. So we deliberately do NOT navigate:
          // the URL stays on the (valid) `/settings/<category>` it already had,
          // so SettingsEditor never re-enters its root and never reopens, and
          // the dock-reconciler shows the "Aucun éditeur ouvert" watermark now
          // that no editor remains. Same shape as closing the last Runs editor.
          return;
        }
      }
      if (!desired) return;
      if (lastSyncedUrlRef.current === desired) return;
      // The settings editor is a singleton — its URI doesn't carry the
      // category, only the URL path does. When that editor is the active one
      // and the URL is already deeper (`/settings/<category>`), don't
      // downgrade it to the bare `/settings`.
      const currentUrl = lastSyncedUrlRef.current;
      if (
        desired === SETTINGS_PREFIX &&
        active?.uri === SETTINGS_URI &&
        currentUrl != null &&
        currentUrl.startsWith(`${SETTINGS_PREFIX}/`)
      ) {
        return;
      }
      lastSyncedUrlRef.current = desired;
      navigate(desired, { replace: true });
    });
  }, [wb, navigate]);

  return null;
};

export default WorkbenchRouterSync;
