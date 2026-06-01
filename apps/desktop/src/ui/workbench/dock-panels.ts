import type {
  AddPanelOptions,
  DockviewApi,
  IDockviewPanel,
} from "dockview-react";
import { WORKBENCH_LAYOUT } from "./constants";
import { getViewLocation, workbenchRegistry } from "./registry";
import type { DockLocation, ViewContribution, ViewId } from "./types";

// Pure helpers describing how view contributions live as dockview panels.
// Kept in their own module (no store / no React) so both the store actions
// (`showView` / `hideView` / `setDockviewApi`) and the reconciler hook can
// import them without forming a cycle.

// Prefix used for every Dockview panel hosting a view contribution. The
// reconciler relies on it to tell a view panel apart from an editor panel
// (whose id is the editor URI). Keep in sync with `viewIdFromPanelId`.
export const VIEW_PANEL_ID_PREFIX = "view:";

export const viewPanelId = (id: ViewId): string =>
  `${VIEW_PANEL_ID_PREFIX}${id}`;

export const viewIdFromPanelId = (panelId: string): ViewId | null =>
  panelId.startsWith(VIEW_PANEL_ID_PREFIX)
    ? panelId.slice(VIEW_PANEL_ID_PREFIX.length)
    : null;

export const isViewPanelId = (panelId: string): boolean =>
  panelId.startsWith(VIEW_PANEL_ID_PREFIX);

// Singleton placeholder panel that holds the editor area open when no real
// editor is present (spec §"Watermark"). Without it, the lone view group (the
// Explorer) would expand to fill the whole dock — VSCode instead keeps the
// sidebar at its width and shows a tab-less "No editor opened" surface. The id
// is recognisable so editor counting (`editorStateFromParams`) and the
// reconciler can tell it apart from both editors and view panels.
export const WATERMARK_PANEL_ID = "wb:watermark";
export const WATERMARK_PANEL_COMPONENT = "wb-watermark";
// Dedicated empty tab for the watermark. The default tab renderer reads editor
// params (uri/typeId) the watermark doesn't carry, so the watermark gets its
// own no-op tab — belt-and-braces alongside the hidden group header.
export const WATERMARK_TAB_COMPONENT = "wb-watermark-tab";

export const isWatermarkPanelId = (panelId: string): boolean =>
  panelId === WATERMARK_PANEL_ID;

// Component name registered in DockviewReact's `components` map for every
// view panel — the actual `ViewContribution` to render is passed via
// `params.viewId`. Letting all views share one host avoids re-registering
// `components` whenever a plugin lands a new view.
export const VIEW_PANEL_COMPONENT = "wb-view";

// Tab component shared by every view panel. Distinct from the editor tab
// because closing a view tab calls `hideView` (sticky) rather than tearing
// down the editor state.
export const VIEW_TAB_COMPONENT = "wb-view-tab";

export type ViewPanelParams = {
  readonly viewId: ViewId;
};

const directionForLocation = (
  loc: DockLocation,
): "left" | "right" | "below" | undefined => {
  switch (loc) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "bottom":
      return "below";
    case "center":
      return undefined;
  }
};

// First view panel in the dock whose contribution declares the same
// `defaultLocation` — used as the anchor so subsequent views stack as tabs
// in the same group instead of spawning side-by-side groups (spec §2.1).
const findAnchorViewPanel = (
  dv: DockviewApi,
  location: DockLocation,
): IDockviewPanel | null => {
  for (const panel of dv.panels) {
    const viewId = viewIdFromPanelId(panel.id);
    if (!viewId) continue;
    const view = workbenchRegistry.getView(viewId);
    if (view && getViewLocation(view) === location) return panel;
  }
  return null;
};

// Classe le groupe d'un panneau en `DockLocation` domaine à partir de sa
// géométrie relative au conteneur dockview (spec workbench-view-lifecycle-ux
// §4.1). Dockview ne tague pas la bordure d'un groupe grid ; on l'infère du
// rect. Fallback sur `defaultLocation` quand le panneau n'est pas dans la grille
// (floating/popout) ou que le conteneur est introuvable.
//
// Note : `DockviewApi` n'expose pas son élément racine (ni dans les types ni au
// runtime en dockview 6) — on remonte au conteneur `.dv-dockview` depuis le
// groupe plutôt que de lire `dv.element`.
export const resolveDockLocation = (
  panel: IDockviewPanel,
  fallback: DockLocation,
): DockLocation => {
  const loc = panel.api.location;
  if (loc.type !== "grid") return fallback; // floating/popout : pas de bordure
  const root = panel.group.element.closest(".dv-dockview");
  if (!root) return fallback;
  const dock = root.getBoundingClientRect();
  const g = panel.group.element.getBoundingClientRect();
  const EPS = 4;
  if (g.bottom >= dock.bottom - EPS && g.top > dock.top + EPS) return "bottom";
  if (g.left <= dock.left + EPS) return "left";
  if (g.right >= dock.right - EPS) return "right";
  return "center";
};

// Any editor panel — used as a positional reference for the *first* view at
// a given location so the new group docks against the editor area rather
// than against whatever group dockview happens to consider active (which
// could be another view's group, e.g. chat).
export const findEditorPanel = (dv: DockviewApi): IDockviewPanel | null => {
  for (const panel of dv.panels) {
    if (!isViewPanelId(panel.id)) return panel;
  }
  return null;
};

const positionForView = (
  dv: DockviewApi,
  location: DockLocation,
): AddPanelOptions["position"] => {
  // 1. Stack as a tab in the existing anchor group, if any (spec §2.1).
  const anchor = findAnchorViewPanel(dv, location);
  if (anchor) return { referencePanel: anchor.api.id };

  // 2. First view at this location: dock against an editor so the new group
  //    sits on the editor's edge regardless of the current active group.
  const direction = directionForLocation(location);
  const editor = findEditorPanel(dv);
  if (editor && direction) {
    return { referencePanel: editor.api.id, direction };
  }

  // 3. No editor either: fall back to a direction relative to the active
  //    group (last-resort path, e.g. boot with no editors yet).
  return direction ? { direction } : undefined;
};

export const addViewPanel = (
  dv: DockviewApi,
  view: ViewContribution,
  opts?: {
    readonly focus?: boolean;
    // Spec §2.2 : `showView` prime sur `defaultLocation` quand une position
    // antérieure a été mémorisée (round-trip `hideView` → `showView`). Le
    // reconciler n'utilise pas l'override — il s'en remet à `defaultLocation`.
    readonly locationOverride?: DockLocation;
    // Spec workbench-view-lifecycle-ux §4.3 : si la position mémorisée était
    // flottante, re-matérialiser la vue en groupe flottant au lieu de la docker.
    readonly floating?: boolean;
  },
): void => {
  const location = opts?.locationOverride ?? getViewLocation(view);
  const panel = dv.addPanel<ViewPanelParams>({
    id: viewPanelId(view.id),
    component: VIEW_PANEL_COMPONENT,
    tabComponent: VIEW_TAB_COMPONENT,
    title: view.title,
    params: { viewId: view.id },
    position: positionForView(dv, location),
    // The reconciler materialises view panels on first eligibility — we don't
    // want that to steal focus from the user's editor (it would also confuse
    // `_syncFromDockview` into thinking no editor is active). `showView`
    // explicitly passes `focus: true` since that's a user-initiated reveal.
    inactive: opts?.focus !== true,
  });
  // Spec workbench-view-lifecycle-ux §4.3 — restore a previously floating view
  // into a floating group rather than docking it to a border. Dockview 6 has
  // no `panel.api.setFloating`; the equivalent is moving the panel into a new
  // floating group. The sidebar pin below is skipped: a floating group doesn't
  // occupy the left anchor.
  if (opts?.floating) {
    dv.addFloatingGroup(panel);
    return;
  }
  // Spec sidebar-user-controlled-width — every time a side-anchored view
  // materialises, (re)assert the drag bounds + pixel width on its group.
  // Dockview rebalances proportionally on any addPanel, which is precisely
  // what we want to undo so the sidebar keeps its user-set width. Applies to
  // both left (Explorer) and right (secondary sidebar) anchor groups.
  if (location === "left" || location === "right") {
    ensureSidebarConstraints(dv, location);
    pinSidebarWidth(dv, location);
  }
};

// Sidebar width policy — each anchor group's width is a *pinned* px value
// driven only by user sash drags. Every structural mutation re-applies it so
// dockview's proportional rebalancing never leaks through. Module-level (not
// store) because it's a hot-path layout detail; the store mirrors it into
// `prefs.{primary,secondary}Sidebar.expandedSizePx` for cross-session persistence.
type Side = "left" | "right";

const SIDE_TO_LOCATION = {
  left: "left",
  right: "right",
} as const satisfies Record<Side, DockLocation>;

// Per-side bounds. Left uses fixed pixel bounds; right has no absolute max —
// the ceiling is a share of the dock width recomputed on every call so the
// clamp adapts to window resizes.
const sideBounds = (
  side: Side,
  dockWidthPx: number,
): { minPx: number; maxPx: number } => {
  if (side === "left") {
    return {
      minPx: WORKBENCH_LAYOUT.primarySidebar.minPx,
      maxPx: WORKBENCH_LAYOUT.primarySidebar.maxPx,
    };
  }
  const { minPx, maxPct } = WORKBENCH_LAYOUT.secondarySidebar;
  return {
    minPx,
    maxPx: Math.max(minPx, Math.floor((dockWidthPx * maxPct) / 100)),
  };
};

// Default pinned widths when prefs carry no persisted value. The right-side
// default (~24 % of a 1500 px dock) mirrors `secondarySidebar.defaultPct`.
const DEFAULT_PINNED_PX: Record<Side, number> = {
  left: 280,
  right: 360,
};

const pinnedWidthPx: Record<Side, number> = { ...DEFAULT_PINNED_PX };

// True while a `setSize` we initiated (or a wrapped mutation) is rebalancing
// the dock, so the `onDidLayoutChange` it triggers isn't mis-read as a
// user-initiated drag of the sash. Shared across sides — a single global flag
// is enough because dockview fires the event once per layout tick.
let isProgrammaticResize = false;

// Container width + group count observed at the last layout tick. Together
// they let `maybeRecordSidebarDrag` discriminate a sash drag (both stable)
// from a window resize (width changed) or a structural mutation we forgot to
// wrap (group count changed).
let lastDockWidthPx = 0;
let lastGroupCount = 0;

const clampWidth = (side: Side, w: number, dockWidthPx: number): number => {
  const { minPx, maxPx } = sideBounds(side, dockWidthPx);
  return Math.min(Math.max(w, minPx), maxPx);
};

// Hydrate the in-memory pinned width from persisted prefs. `null` means we
// have never observed a user drag, so fall back to the default. `dockWidthPx`
// is optional — at hydration time the dock isn't mounted yet, so we clamp
// against the value itself (effectively only enforcing `minPx`); the next
// `pinSidebarWidth` will re-apply with a real `dv.width`.
export const setPinnedWidthPx = (
  side: Side,
  px: number | null,
  dockWidthPx = 0,
): void => {
  pinnedWidthPx[side] =
    px === null || !Number.isFinite(px) || px <= 0
      ? DEFAULT_PINNED_PX[side]
      : clampWidth(side, px, dockWidthPx || px);
};

export const getPinnedWidthPx = (side: Side): number => pinnedWidthPx[side];

// Bound the drag range on the anchor group. NOT used to freeze the width
// (`minimumWidth === maximumWidth` would block the user too) — the pixel
// lock comes from re-pinning after each mutation.
export const ensureSidebarConstraints = (
  dv: DockviewApi,
  side: Side,
): void => {
  const anchor = findAnchorViewPanel(dv, SIDE_TO_LOCATION[side]);
  if (!anchor) return;
  const { minPx, maxPx } = sideBounds(side, dv.width);
  anchor.group.api.setConstraints({
    minimumWidth: minPx,
    maximumWidth: maxPx,
  });
};

// Re-apply the pinned width to one anchor group. The guard suppresses the
// synchronous `onDidLayoutChange` dockview fires inside `setSize` so the
// re-pin isn't echoed back as a user drag. Reset is microtask-deferred
// because dockview emits the event synchronously inside `setSize`.
export const pinSidebarWidth = (dv: DockviewApi, side: Side): void => {
  const anchor = findAnchorViewPanel(dv, SIDE_TO_LOCATION[side]);
  if (!anchor) return;
  isProgrammaticResize = true;
  try {
    anchor.group.api.setSize({ width: pinnedWidthPx[side] });
  } finally {
    queueMicrotask(() => {
      isProgrammaticResize = false;
    });
  }
};

// Wrap a structural mutation (open/close panel, watermark transitions) so the
// proportional rebalancing it triggers is immediately corrected by a re-pin
// of both sides and never mis-read as a user drag. The two `pinSidebarWidth`
// calls share the same `isProgrammaticResize` window because the microtask
// reset runs after both synchronous `setSize` calls.
export const withSidebarPinned = (
  dv: DockviewApi,
  mutate: () => void,
): void => {
  isProgrammaticResize = true;
  try {
    mutate();
  } finally {
    pinSidebarWidth(dv, "left");
    pinSidebarWidth(dv, "right");
  }
};

// Called from the store's `onDidLayoutChange` handler. Records the new pinned
// width per side only when the change looks like a sash drag (no programmatic
// resize, dock width stable, group count stable). Every other case re-pins so
// each sidebar holds its pixel width through window resizes and unwrapped
// structural changes (e.g. user X-clicks an editor tab). A sash drag can only
// move one side per tick — dockview doesn't support simultaneous drags.
export const maybeRecordSidebarDrag = (
  dv: DockviewApi,
  persist: (side: Side, px: number) => void,
): void => {
  const dockWidth = dv.width;
  const groupCount = dv.groups.length;
  const dockResized = dockWidth !== lastDockWidthPx;
  const structureChanged = groupCount !== lastGroupCount;
  lastDockWidthPx = dockWidth;
  lastGroupCount = groupCount;

  for (const side of ["left", "right"] as const) {
    const anchor = findAnchorViewPanel(dv, SIDE_TO_LOCATION[side]);
    if (!anchor) continue;
    if (isProgrammaticResize || dockResized || structureChanged) {
      pinSidebarWidth(dv, side);
      continue;
    }
    const w = anchor.group.api.width;
    if (w > 0 && w !== pinnedWidthPx[side]) {
      pinnedWidthPx[side] = clampWidth(side, w, dockWidth);
      persist(side, pinnedWidthPx[side]);
    }
  }
};

// Dock the watermark in the center editor area: opposite whichever border view
// exists (Explorer at left → watermark at its right, etc.), so it occupies the
// space an editor would. Falls back to the active group when no view anchors it.
const watermarkPosition = (dv: DockviewApi): AddPanelOptions["position"] => {
  for (const loc of ["left", "right", "bottom"] as const) {
    const anchor = findAnchorViewPanel(dv, loc);
    if (!anchor) continue;
    const direction =
      loc === "left" ? "right" : loc === "right" ? "left" : "above";
    return { referencePanel: anchor.api.id, direction };
  }
  return undefined;
};

// Materialise the singleton watermark panel. Its group's header is hidden and
// the group is locked so it reads as VSCode's tab-less "No editor opened" area
// rather than a closeable tab, and can't be turned into a drop target.
export const addWatermarkPanel = (dv: DockviewApi): void => {
  if (dv.getPanel(WATERMARK_PANEL_ID)) return;
  const panel = dv.addPanel({
    id: WATERMARK_PANEL_ID,
    component: WATERMARK_PANEL_COMPONENT,
    tabComponent: WATERMARK_TAB_COMPONENT,
    title: "",
    position: watermarkPosition(dv),
    inactive: true,
  });
  panel.group.locked = "no-drop-target";
  panel.group.header.hidden = true;
  // Splitting the anchor group handed the watermark ~half the width — pull
  // both sidebars back to their pinned px width so they "keep their size".
  pinSidebarWidth(dv, "left");
  pinSidebarWidth(dv, "right");
};
