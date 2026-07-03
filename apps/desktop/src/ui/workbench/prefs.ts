import type {
  ActivityId,
  DockLocation,
  EditorTypeId,
  EditorUri,
  ViewId,
} from "./types";

const PREFS_KEY = "ctxfirst:workbench:v1";

export type WorkbenchPrefs = {
  activeActivity: ActivityId | null;
  primarySidebar: {
    expandedSizePx: number | null;
  };
  secondarySidebar: {
    expandedSizePx: number | null;
  };
  // Snapshot dockview unifié (éditeurs + vues). Spec workbench-unified-dockview.md
  // §6 — remplace l'ancien tuple {dockview, dockviewActivity, workbenchGrid,
  // workspaceByActivity}. L'activity bar ne fragmente plus le layout par
  // activité, donc un seul snapshot global suffit.
  dockLayout: unknown;
  openEditors: ReadonlyArray<{ uri: EditorUri; panelId: string }>;
  // Dernière vue GLOBALE (sans whenEditor) active dans le groupe gauche.
  // État unique, non indexé par type d'éditeur — corrige le shadowing décrit
  // dans la spec workbench-view-lifecycle-ux §3.
  lastActiveLeftView: ViewId | null;
  // Vue active du groupe d'ancrage gauche, mémorisée par type d'éditeur.
  // Pilote `pickPrimaryView` (§2.3, câblage PR 3). Depuis la spec
  // workbench-view-lifecycle-ux §3, ne contient PLUS QUE des vues contextuelles
  // (dotées d'un `whenEditor`) ; les vues globales vont dans `lastActiveLeftView`.
  activeViewByEditorType: Record<EditorTypeId | "default", ViewId | null>;
  // Dernière position connue de chaque vue (§2.2). Capturée à `hideView` ;
  // utilisée par `showView` pour re-matérialiser une vue à sa précédente
  // bordure si le groupe d'origine a disparu.
  viewLocations: Record<
    ViewId,
    { location: DockLocation; floating: boolean }
  >;
  // Vues explicitement masquées par l'utilisateur (X d'onglet, palette…).
  // Persisté pour qu'un hide survive au reload : sans ça, une vue à
  // `autoShow: true` encore éligible est ré-ajoutée par le reconciler additif
  // au boot suivant (spec workbench audit H-1). Fusionné au load avec les
  // seules vues encore enregistrées via `prunePrefs`.
  hiddenViews: ReadonlyArray<ViewId>;
  templateEditor: {
    gridSnap: {
      enabled: boolean;
      // px — pas de snap sur les drags du canvas. Défaut : 20, aligné sur le
      // minor grid du `<Background>` de l'éditeur.
      size: number;
    };
    // Largeur (px) de l'overlay Inspector ancré à droite du canvas. Valeur
    // globale (partagée par tous les templates). Persistée à la fin du drag
    // de la poignée de resize.
    inspectorWidthPx: number;
  };
};

const GRID_SNAP_DEFAULT_SIZE = 20;
const GRID_SNAP_MIN_SIZE = 2;
const GRID_SNAP_MAX_SIZE = 200;

export const clampGridSnapSize = (n: unknown): number => {
  if (typeof n !== "number" || !Number.isFinite(n)) return GRID_SNAP_DEFAULT_SIZE;
  if (n < GRID_SNAP_MIN_SIZE) return GRID_SNAP_DEFAULT_SIZE;
  if (n > GRID_SNAP_MAX_SIZE) return GRID_SNAP_DEFAULT_SIZE;
  return n;
};

export const INSPECTOR_WIDTH_DEFAULT_PX = 360;
export const INSPECTOR_WIDTH_MIN_PX = 280;
export const INSPECTOR_WIDTH_MAX_PX = 1080;

export const clampInspectorWidth = (n: unknown): number => {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return INSPECTOR_WIDTH_DEFAULT_PX;
  }
  if (n < INSPECTOR_WIDTH_MIN_PX) return INSPECTOR_WIDTH_MIN_PX;
  if (n > INSPECTOR_WIDTH_MAX_PX) return INSPECTOR_WIDTH_MAX_PX;
  return Math.round(n);
};

export const DEFAULT_PREFS: WorkbenchPrefs = {
  activeActivity: null,
  primarySidebar: {
    expandedSizePx: null,
  },
  secondarySidebar: {
    expandedSizePx: null,
  },
  dockLayout: null,
  openEditors: [],
  lastActiveLeftView: null,
  activeViewByEditorType: {},
  viewLocations: {},
  hiddenViews: [],
  templateEditor: {
    gridSnap: { enabled: false, size: GRID_SNAP_DEFAULT_SIZE },
    inspectorWidthPx: INSPECTOR_WIDTH_DEFAULT_PX,
  },
};

// Legacy keys we explicitly ignore on load. Their formats can't be safely
// converted to a Dockview snapshot (Gridview is a different topology) so we
// reset the layout one-shot at first boot post-migration (cf. spec §Migration).
type LegacyShape = {
  dockview?: unknown;
  dockviewActivity?: ActivityId | null;
  workbenchGrid?: unknown;
  workspaceByActivity?: unknown;
};

export const loadPrefs = (): WorkbenchPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<WorkbenchPrefs> & LegacyShape;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      primarySidebar: {
        ...DEFAULT_PREFS.primarySidebar,
        ...(parsed.primarySidebar ?? {}),
      },
      secondarySidebar: {
        ...DEFAULT_PREFS.secondarySidebar,
        ...(parsed.secondarySidebar ?? {}),
      },
      lastActiveLeftView: parsed.lastActiveLeftView ?? null,
      activeViewByEditorType:
        parsed.activeViewByEditorType ?? DEFAULT_PREFS.activeViewByEditorType,
      viewLocations: parsed.viewLocations ?? DEFAULT_PREFS.viewLocations,
      hiddenViews: Array.isArray(parsed.hiddenViews)
        ? parsed.hiddenViews
        : DEFAULT_PREFS.hiddenViews,
      templateEditor: {
        gridSnap: {
          enabled: Boolean(parsed.templateEditor?.gridSnap?.enabled),
          size: clampGridSnapSize(parsed.templateEditor?.gridSnap?.size),
        },
        inspectorWidthPx: clampInspectorWidth(
          parsed.templateEditor?.inspectorWidthPx,
        ),
      },
    };
  } catch {
    return DEFAULT_PREFS;
  }
};

export const savePrefs = (prefs: WorkbenchPrefs): void => {
  try {
    const json = JSON.stringify(prefs);
    localStorage.setItem(PREFS_KEY, json);
    console.log("[workbench] prefs saved", {
      bytes: json.length,
      hasDockLayout: prefs.dockLayout !== null && prefs.dockLayout !== undefined,
      activeActivity: prefs.activeActivity,
    });
  } catch {
    /* noop */
  }
};

// Drop entries whose keys are not in the provided sets. Keeps the
// per-editor-type / per-view maps from growing forever when contributions are
// renamed or removed. Returns a new prefs object only if something changed.
export const prunePrefs = (
  prefs: WorkbenchPrefs,
  known: {
    readonly activities: ReadonlySet<ActivityId>;
    readonly editorTypes: ReadonlySet<EditorTypeId>;
    readonly views: ReadonlySet<ViewId>;
    // Vues persistables PAR TYPE d'éditeur — celles dotées d'un `whenEditor`
    // (spec workbench-view-lifecycle-ux §3.1). Une entrée `activeViewByEditorType`
    // pointant hors de ce set est un résidu « vue globale pour tel type » du
    // modèle pré-lifecycle ; on la retire au pruning (one-shot de migration).
    readonly perTypePersistableViews: ReadonlySet<ViewId>;
  },
): WorkbenchPrefs => {
  let changed = false;

  const pruneActiveViewByEditorType = (() => {
    const cur = prefs.activeViewByEditorType;
    const next: Record<EditorTypeId | "default", ViewId | null> = {};
    let mut = false;
    for (const k of Object.keys(cur)) {
      const v = cur[k];
      const keep =
        (k === "default" || known.editorTypes.has(k)) &&
        (v === null ||
          (known.views.has(v) && known.perTypePersistableViews.has(v)));
      if (keep) next[k] = v;
      else mut = true;
    }
    return mut ? ((changed = true), next) : cur;
  })();

  // `lastActiveLeftView` may point at a removed view. Reset to null so the
  // next mount doesn't try to restore a phantom global left view.
  const nextLastActiveLeftView = (() => {
    const cur = prefs.lastActiveLeftView;
    if (cur === null) return null;
    if (known.views.has(cur)) return cur;
    changed = true;
    return null;
  })();

  const pruneViewLocations = (() => {
    const cur = prefs.viewLocations;
    const next: WorkbenchPrefs["viewLocations"] = {};
    let mut = false;
    for (const k of Object.keys(cur)) {
      if (known.views.has(k)) next[k] = cur[k];
      else mut = true;
    }
    return mut ? ((changed = true), next) : cur;
  })();

  // `activeActivity` may point at a removed activity. Reset to null in that
  // case so the next mount doesn't try to restore a phantom activity.
  const nextActiveActivity = (() => {
    const cur = prefs.activeActivity;
    if (cur === null) return null;
    if (known.activities.has(cur)) return cur;
    changed = true;
    return null;
  })();

  // Drop persisted hides pointing at views that no longer have a contribution
  // (spec workbench audit H-1) — otherwise a renamed/removed view would stay
  // permanently "hidden" and its id would leak forever.
  const nextHiddenViews = (() => {
    const cur = prefs.hiddenViews;
    const next = cur.filter((id) => known.views.has(id));
    if (next.length === cur.length) return cur;
    changed = true;
    return next;
  })();

  if (!changed) return prefs;
  return {
    ...prefs,
    activeActivity: nextActiveActivity,
    lastActiveLeftView: nextLastActiveLeftView,
    activeViewByEditorType: pruneActiveViewByEditorType,
    viewLocations: pruneViewLocations,
    hiddenViews: nextHiddenViews,
  };
};
