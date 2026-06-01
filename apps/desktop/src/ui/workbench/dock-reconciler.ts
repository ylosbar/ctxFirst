import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  useActiveActivity,
  useActiveEditor,
  useDockviewReady,
  useEditors,
  useWorkbenchStore,
} from "./store";
import {
  getViewLocation,
  isViewEligible,
  workbenchRegistry,
} from "./registry";
import {
  useViewAvailabilityVersion,
  viewAvailability,
} from "./view-availability";
import {
  addViewPanel,
  addWatermarkPanel,
  isViewPanelId,
  isWatermarkPanelId,
  viewPanelId,
  VIEW_PANEL_COMPONENT,
  WATERMARK_PANEL_ID,
  withSidebarPinned,
} from "./dock-panels";
import type {
  ActivityId,
  DockLocation,
  EditorState,
  EditorTypeId,
  ViewContribution,
  ViewId,
} from "./types";

// Re-exported so existing consumers (`WorkbenchDock.tsx`) keep working
// without churning their imports. New code should reach into `dock-panels`
// directly.
export { VIEW_PANEL_COMPONENT };

type PrimaryPick = {
  readonly viewId: ViewId;
  // Spec §2.3 — only the "deterministic intent" cases (persisted choice,
  // editor's declared default, contextual match) write back into
  // `activeViewByEditorType`. The catch-all global fallback (case 4) merely
  // surfaces *something*, so we don't promote it as the user's preference.
  readonly persist: boolean;
};

const byPriority = (a: ViewContribution, b: ViewContribution): number => {
  const pa = a.priority ?? 100;
  const pb = b.priority ?? 100;
  if (pa !== pb) return pa - pb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

// Spec §2.3 — picks the view that should be active in the left anchor group
// when an editor of `typeId` becomes active. Pure function: reads the
// store + registry but doesn't mutate. Returns `null` when there's nothing
// sensible to activate (e.g. no left view registered at all).
const pickPrimaryView = (
  typeId: EditorTypeId | null,
  ctx: { activity: ActivityId | null; editor: EditorState | null },
): PrimaryPick | null => {
  const key = typeId ?? "default";
  const state = useWorkbenchStore.getState();

  // 1. User's last persisted choice — only honor it if the view is still
  //    eligible in the current context (registered, seen, not hidden, anchored
  //    left, and matching `whenEditor` + `activity` for the active editor and
  //    activity). Without the context checks, a persisted view inherited from
  //    a different activity — e.g. `runs.list` (activity-bound to "runs"),
  //    persisted as the active left view for `template.editor` after the user
  //    clicked the Runs activity while a template was open — would shadow the
  //    editor's `defaultPrimaryView`. Falling through here lets case (2) pick
  //    the editor's declared default instead.
  const persistedId = state.prefs.activeViewByEditorType[key] ?? null;
  if (persistedId) {
    const persistedView = workbenchRegistry.getView(persistedId);
    if (
      persistedView &&
      state.seenViews.has(persistedId) &&
      !state.hiddenViews.has(persistedId) &&
      viewAvailability.isAvailable(persistedId) &&
      getViewLocation(persistedView) === "left" &&
      (!persistedView.whenEditor || persistedView.whenEditor(ctx.editor)) &&
      (!persistedView.activity || persistedView.activity === ctx.activity)
    ) {
      return { viewId: persistedId, persist: false };
    }
  }

  // 2. Editor type's declared `defaultPrimaryView` (templates → Plugins).
  if (typeId) {
    const editorType = workbenchRegistry.getEditorTypeById(typeId);
    const defaultPrimary = editorType?.defaultPrimaryView ?? null;
    if (defaultPrimary && workbenchRegistry.getView(defaultPrimary)) {
      return { viewId: defaultPrimary, persist: true };
    }
  }

  // 3. Lowest-priority contextual view (whenEditor matched) at left.
  const leftViews = workbenchRegistry.viewsForLocation("left", ctx);
  const leftContextual = leftViews
    .filter((v) => v.whenEditor)
    .filter(
      (v) => !state.hiddenViews.has(v.id) && viewAvailability.isAvailable(v.id),
    )
    .sort(byPriority);
  if (leftContextual.length > 0) {
    return { viewId: leftContextual[0].id, persist: true };
  }

  // 4. Global `lastActiveLeftView` (spec workbench-view-lifecycle-ux §3.3) —
  //    the last global (no-`whenEditor`) left view the user activated, restored
  //    across editor switches. Honor it only while still eligible, anchored
  //    left and not hidden. `persist: false` — it's already tracked as the
  //    global slot, not a per-type preference.
  const lastGlobalId = state.prefs.lastActiveLeftView;
  if (lastGlobalId) {
    const lastGlobal = workbenchRegistry.getView(lastGlobalId);
    if (
      lastGlobal &&
      !lastGlobal.whenEditor &&
      state.seenViews.has(lastGlobalId) &&
      !state.hiddenViews.has(lastGlobalId) &&
      viewAvailability.isAvailable(lastGlobalId) &&
      getViewLocation(lastGlobal) === "left" &&
      (!lastGlobal.activity || lastGlobal.activity === ctx.activity)
    ) {
      return { viewId: lastGlobalId, persist: false };
    }
  }

  // 5. Lowest-priority global view at left (Explorer, typically). Doesn't
  //    persist — falling back to it shouldn't promote it as the user's
  //    preference for this editor type.
  const leftGlobal = leftViews
    .filter((v) => !v.whenEditor)
    .filter(
      (v) => !state.hiddenViews.has(v.id) && viewAvailability.isAvailable(v.id),
    )
    .sort(byPriority);
  if (leftGlobal.length > 0) {
    return { viewId: leftGlobal[0].id, persist: false };
  }

  return null;
};

// Reconciler vues ↔ dockview (cf. spec workbench-unified-dockview.md §2).
// Additif uniquement : ne retire jamais une vue parce qu'elle est devenue
// inéligible. Seuls les retraits via `hideView` (utilisateur) ou
// désenregistrement de la contribution déclenchent un removePanel.
export const useDockReconciler = (): void => {
  const ready = useDockviewReady();
  const activeEditor = useActiveEditor();
  const editors = useEditors();
  const activeActivity = useActiveActivity();
  const registryVersion = useSyncExternalStore(
    workbenchRegistry.subscribe,
    workbenchRegistry.getVersion,
    () => 0,
  );
  const availabilityVersion = useViewAvailabilityVersion();
  const hiddenViews = useWorkbenchStore((s) => s.hiddenViews);

  const desired = useMemo<ReadonlyArray<ViewContribution>>(() => {
    const ctx = { activity: activeActivity, editor: activeEditor };
    const eligible = workbenchRegistry.eligibleViews(ctx).filter((v) => {
      // `hiddenViews` is respected for BOTH lifecycles so a user "hide" holds
      // while the context is stable (spec workbench-view-lifecycle-ux §2.2,
      // test plan Point 2). The difference is in the removal pass below: a
      // `contextual` view's hide is *cleared* the moment its context goes
      // inéligible, so it re-appears when the context returns; a `persistent`
      // view's hide is sticky until an explicit `showView`.
      if (hiddenViews.has(v.id)) return false;
      if (!viewAvailability.isAvailable(v.id)) return false;
      // `autoShow: false` opts the view out of automatic materialization. It
      // only enters the dock via an explicit `showView` (ActivityBar button,
      // palette, ...) or by being restored from the persisted snapshot — so it
      // stays closed on first boot (ex. Terminal).
      if (v.autoShow === false) return false;
      return true;
    });
    // Sort by priority ascending (default 100) so addPanel order in the
    // effect below produces a deterministic tab order within each anchor
    // group (spec §2.1, §2.3). Tie-break on id for stability across renders.
    return [...eligible].sort((a, b) => {
      const pa = a.priority ?? 100;
      const pb = b.priority ?? 100;
      if (pa !== pb) return pa - pb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    // `availabilityVersion` and `registryVersion` participate via the external
    // stores — listed so this memo refreshes on bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeActivity,
    activeEditor,
    registryVersion,
    availabilityVersion,
    hiddenViews,
  ]);

  useEffect(() => {
    if (!ready) return;
    const dv = useWorkbenchStore.getState()._dockviewApi;
    if (!dv) return;
    // Views being added this pass — used to decide whether a newly-eligible
    // contextual view should claim the foreground of its group (see below).
    const toAdd = desired.filter((v) => !dv.getPanel(viewPanelId(v.id)));
    const contextualAddsByLoc = new Map<DockLocation, number>();
    for (const v of toAdd) {
      if (v.lifecycle !== "contextual") continue;
      const loc = getViewLocation(v);
      contextualAddsByLoc.set(loc, (contextualAddsByLoc.get(loc) ?? 0) + 1);
    }
    for (const view of toAdd) {
      addViewPanel(dv, view);
      // Sticky: once a view has appeared at least once, remember it so the
      // reconciler can re-add it after `showView` removes the entry from
      // `hiddenViews`. `seenViews` is otherwise reconstructed from the dock
      // snapshot at mount.
      useWorkbenchStore.setState((s) => {
        if (s.seenViews.has(view.id)) return s;
        const next = new Set(s.seenViews);
        next.add(view.id);
        return { ...s, seenViews: next };
      });
      // Bring a freshly-added contextual view to the foreground of its group
      // when it's the only contextual addition at its location this tick. Use
      // case : sélectionner une node dans un template editor → l'Inspector
      // devient disponible et serait ajouté en tab inactive derrière le Chat ;
      // ici on le ramène au premier plan. Sauté quand plusieurs vues
      // contextuelles arrivent ensemble (ex. ouverture d'un runs.viewer :
      // Itérations/Artefact/Graphe/Stats) — dans ce cas l'ordre par priorité
      // (lowest first) fait que le 1er ajouté devient naturellement actif
      // dans le groupe nouveau-ou-vide, ce qu'on ne veut pas perturber.
      if (
        view.lifecycle === "contextual" &&
        contextualAddsByLoc.get(getViewLocation(view)) === 1
      ) {
        const added = dv.getPanel(viewPanelId(view.id));
        if (added && added.group.activePanel?.id !== added.api.id) {
          useWorkbenchStore.setState({ _suppressActiveTracking: true });
          try {
            added.api.setActive();
          } finally {
            useWorkbenchStore.setState({ _suppressActiveTracking: false });
          }
        }
      }
    }
    // Removals are NOT performed here for `persistent` views (spec §2
    // invariants): an editor flipping `whenEditor` to false leaves the panel
    // mounted with its React state intact. `contextual` views are torn down by
    // the dedicated removal pass below.
  }, [ready, desired]);

  // Spec workbench-view-lifecycle-ux §1.2 + §2.2 — soustractif pour les
  // `contextual` ET les vues activity-bound. Pour chaque vue éligible à ce
  // pass devenue inéligible :
  //  (a) ferme son panneau s'il est monté, sous `_suppressHideTracking` pour
  //      que `onDidRemovePanel` ne l'enregistre PAS comme un hide utilisateur ;
  //  (b) efface son éventuelle entrée `hiddenViews` (hide intra-épisode) pour
  //      qu'au retour du contexte elle ne soit plus masquée → réapparaisse.
  // Inclus les vues `activity`-bound (ex. explorer.tree, runs.list) : chaque
  // activité de l'ActivityBar définit son propre "workspace" gauche ; cliquer
  // Runs ne doit pas laisser l'Explorer monté. Pour ces vues, le `lifecycle`
  // explicite n'est pas nécessaire : l'appartenance à une activité suffit.
  // On itère le registre (pas seulement `dv.panels`) car une vue fermée
  // manuellement n'a plus de panneau à parcourir, mais doit voir son hide
  // nettoyé au changement de contexte (test plan Point 2). Les `persistent`
  // non-activity-bound sont intouchées : leur hide reste sticky jusqu'à un
  // `showView` explicite.
  useEffect(() => {
    if (!ready) return;
    const dv = useWorkbenchStore.getState()._dockviewApi;
    if (!dv) return;
    const ctx = { activity: activeActivity, editor: activeEditor };
    for (const view of workbenchRegistry.views()) {
      const isContextual = view.lifecycle === "contextual";
      const isActivityBound = Boolean(view.activity);
      if (!isContextual && !isActivityBound) continue;
      const eligible =
        isViewEligible(view, ctx) && viewAvailability.isAvailable(view.id);
      if (eligible) continue;
      const panel = dv.getPanel(viewPanelId(view.id));
      useWorkbenchStore.setState({ _suppressHideTracking: true });
      try {
        if (panel) withSidebarPinned(dv, () => panel.api.close());
      } finally {
        useWorkbenchStore.setState({ _suppressHideTracking: false });
      }
      useWorkbenchStore.setState((s) => {
        if (!s.hiddenViews.has(view.id)) return s;
        const next = new Set(s.hiddenViews);
        next.delete(view.id);
        return { ...s, hiddenViews: next };
      });
    }
    // `availabilityVersion` / `registryVersion` participate via the external
    // stores — listed so the pass re-runs when a view's availability flips or
    // a contribution lands.
  }, [
    ready,
    activeEditor,
    activeActivity,
    availabilityVersion,
    registryVersion,
  ]);

  // Spec §2.3 — auto-switch the active view in the left anchor group when
  // the active editor's type changes. Runs *after* the additive effect above
  // so any newly materialised panel (e.g. `templates.metadata` appearing the
  // moment a template editor activates) is already in the dock when we look
  // it up. Tracks the previous typeId via a ref so we only fire on actual
  // transitions — not on every render that produces the same value.
  const activeTypeId = activeEditor?.typeId ?? null;
  const prevTypeIdRef = useRef<EditorTypeId | null | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    const dv = useWorkbenchStore.getState()._dockviewApi;
    if (!dv) return;
    if (prevTypeIdRef.current === activeTypeId) return;
    prevTypeIdRef.current = activeTypeId;

    const pick = pickPrimaryView(activeTypeId, {
      activity: activeActivity,
      editor: activeEditor,
    });
    if (!pick) return;
    const panel = dv.getPanel(viewPanelId(pick.viewId));
    if (!panel) return;
    // Already the active panel of its group → still persist (case 2/3 should
    // record the user-visible state) but skip the redundant setActive.
    if (panel.group.activePanel?.id !== panel.api.id) {
      // Dockview fires `onDidActivePanelChange` synchronously inside
      // `setActive`. Raise the suppress flag around the call so the store
      // handler (cf. `store.ts` setDockviewApi) doesn't echo this
      // reconciler-initiated activation back into prefs and shadow the
      // user's actual choice for this editor type.
      useWorkbenchStore.setState({ _suppressActiveTracking: true });
      try {
        panel.api.setActive();
      } finally {
        useWorkbenchStore.setState({ _suppressActiveTracking: false });
      }
    }
    if (pick.persist) {
      const typeKey = activeTypeId ?? "default";
      useWorkbenchStore
        .getState()
        .setActiveViewForEditorType(typeKey, pick.viewId);
    }
    // `desired` is included so we re-evaluate after the additive pass has
    // potentially added the panel we want to activate (first time a template
    // is opened, `templates.metadata` only appears in the dock during the
    // effect above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeTypeId, desired]);

  // Spec §"Watermark" — keep the editor area open with a tab-less "No editor
  // opened" surface whenever views (e.g. the Explorer) are docked but no editor
  // is. Without it the lone view group expands to fill the dock. The
  // openEditor→watermark transition is handled in the store; this effect is the
  // backstop that adds the watermark when the last editor closes, and removes
  // it if an editor appears by any other path. Tracks `editors` + `desired` so
  // it re-evaluates on both editor and view changes.
  useEffect(() => {
    if (!ready) return;
    const dv = useWorkbenchStore.getState()._dockviewApi;
    if (!dv) return;
    const hasEditor = dv.panels.some(
      (p) => !isViewPanelId(p.id) && !isWatermarkPanelId(p.id),
    );
    const hasView = dv.panels.some((p) => isViewPanelId(p.id));
    const watermark = dv.getPanel(WATERMARK_PANEL_ID);
    if (!hasEditor && hasView && !watermark) {
      addWatermarkPanel(dv);
    } else if (hasEditor && watermark) {
      // Spec sidebar-user-controlled-width §3 — closing the watermark when an
      // editor appears is exactly the path the previous fix didn't cover:
      // without re-pinning, the sidebar would re-absorb part of the released
      // space.
      withSidebarPinned(dv, () => watermark.api.close());
    }
  }, [ready, editors, desired]);
};
