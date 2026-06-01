import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/shallow";
import type { DockviewApi, IDockviewPanel } from "dockview-react";
import {
  getViewLocation,
  isPrimaryPersistablePerType,
  workbenchRegistry,
} from "./registry";
import {
  addViewPanel,
  ensureSidebarConstraints,
  findEditorPanel,
  isViewPanelId,
  maybeRecordSidebarDrag,
  pinSidebarWidth,
  resolveDockLocation,
  setPinnedWidthPx,
  viewIdFromPanelId,
  viewPanelId,
  WATERMARK_PANEL_ID,
  withSidebarPinned,
} from "./dock-panels";

type SidebarSide = "left" | "right";
import {
  clampGridSnapSize,
  clampInspectorWidth,
  loadPrefs,
  prunePrefs,
  savePrefs,
  type WorkbenchPrefs,
} from "./prefs";
import type {
  ActivityId,
  EditorState,
  EditorTypeId,
  EditorUri,
  OpenEditorOptions,
  ViewId,
  WorkbenchApi,
  WorkbenchEvent,
} from "./types";

export type EditorPanelParams = {
  readonly uri: EditorUri;
  readonly typeId: string;
};

export const WORKBENCH_TAB_COMPONENT = "wb-tab";

export const workbenchTabComponentForType = (typeId: string): string =>
  `wb-tab:${typeId}`;

export type WorkbenchState = {
  readonly prefs: WorkbenchPrefs;
  readonly editors: ReadonlyArray<EditorState>;
  readonly activeEditor: EditorState | null;
  readonly activeActivity: ActivityId | null;
  readonly dockviewReady: boolean;
  // Vues actuellement matérialisées dans le dock (panneau présent). Reflet
  // réactif de l'état dockview, mis à jour dans `_syncFromDockview` à chaque
  // changement de layout — permet aux composants de réagir à l'ouverture/
  // fermeture d'une vue (ex. masquer le bouton flottant chat quand `chat.main`
  // est ouverte) sans interroger l'API impérative dockview.
  readonly openViewIds: ReadonlySet<ViewId>;
};

type PendingOpen = {
  readonly uri: EditorUri;
  readonly opts?: OpenEditorOptions;
};

// Fields prefixed `_` are imperative handles that live in the store so the
// lifecycle helpers and actions share them. Do NOT subscribe to them via
// selectors — they change frequently and have no reactive meaning.
type WorkbenchStore = WorkbenchState & {
  _dockviewApi: DockviewApi | null;
  _pendingOpens: PendingOpen[];
  _saveTimer: number | null;
  // Debounce handle for persisting the user-controlled sidebar width during
  // a sash drag (spec sidebar-user-controlled-width). Updated in
  // `onDidLayoutChange`, flushed 250 ms after the last drag tick. Cleared in
  // `disposeDockviewApi` so a pending write doesn't fire after teardown.
  _pinnedWidthSaveTimer: number | null;
  // `beforeunload` listener registered in `setDockviewApi` to flush any
  // pending debounced saves before the renderer tears down. Held here so
  // `disposeDockviewApi` can unregister it.
  _beforeUnloadHandler: (() => void) | null;
  // Spec workbench-unified-dockview.md §2 — état runtime du reconciler vues
  // ↔ dockview. Non-persisté : `seenViews` est reconstruit depuis le
  // snapshot dockview au mount (toute vue présente y est, par définition,
  // déjà apparue) ; `hiddenViews` repart vide (la décision de masquage ne
  // survit pas au reload — seul le snapshot dockview le fait).
  seenViews: ReadonlySet<ViewId>;
  hiddenViews: ReadonlySet<ViewId>;
  // Spec §2.3 : posé par le reconciler juste avant un `setActive`
  // programmatique pour distinguer une activation initiée par le reconciler
  // d'un clic utilisateur. `onDidActivePanelChange` consulte le flag pour
  // savoir s'il doit ou non persister la préférence `activeViewByEditorType`.
  // Dockview fire `onDidActivePanelChange` synchronement dans `setActive`,
  // donc on peut lever/rabaisser le flag autour de l'appel.
  _suppressActiveTracking: boolean;
  // Spec workbench-view-lifecycle-ux §1.2 : symétrique de `_suppressActiveTracking`
  // mais pour les retraits. Posé par le reconciler juste avant de fermer le
  // panneau d'une vue `contextual` devenue inéligible, pour que
  // `onDidRemovePanel` n'interprète PAS l'auto-retrait comme un hide utilisateur
  // (sinon la vue serait marquée `hiddenViews` et ne reviendrait jamais).
  _suppressHideTracking: boolean;

  setDockviewApi: (api: DockviewApi) => void;
  disposeDockviewApi: () => void;

  openEditor: (uri: EditorUri, opts?: OpenEditorOptions) => EditorState;
  closeEditor: (uri: EditorUri) => void;
  closeEditorByPanel: (panelId: string) => void;

  showView: (id: ViewId) => void;
  hideView: (id: ViewId) => void;
  toggleView: (id: ViewId) => void;
  togglePrimarySidebar: () => void;
  toggleSecondarySidebar: () => void;
  toggleBottomDock: () => void;

  activateActivity: (id: ActivityId) => void;

  // Spec §2.3 : mémorise la vue active du groupe d'ancrage gauche pour un
  // type d'éditeur donné. La clé `"default"` couvre le cas "aucun éditeur
  // actif" (ex. boot sur Overview avant tout `openEditor`).
  setActiveViewForEditorType: (
    typeId: EditorTypeId | "default",
    viewId: ViewId | null,
  ) => void;

  // Spec workbench-view-lifecycle-ux §3.4 : mémorise la dernière vue GLOBALE
  // (sans whenEditor) active dans le groupe gauche. État unique, miroir de
  // `setActiveViewForEditorType` mais non indexé par type.
  setLastActiveLeftView: (viewId: ViewId | null) => void;

  // Spec template-editor-grid-snap : patch partiel du bloc `templateEditor.gridSnap`.
  // Persisté via `_updatePrefs` (localStorage renderer).
  setTemplateEditorGridSnap: (
    next: Partial<WorkbenchPrefs["templateEditor"]["gridSnap"]>,
  ) => void;

  // Largeur (px) de l'overlay Inspector du TemplateEditor. Globale à tous
  // les templates. Persistée via `_updatePrefs`.
  setTemplateEditorInspectorWidth: (px: number) => void;

  listEditors: () => ReadonlyArray<EditorState>;

  _updatePrefs: (mut: (prev: WorkbenchPrefs) => WorkbenchPrefs) => void;
  _syncFromDockview: () => void;
};

const editorStateFromParams = (
  panelId: string,
  params: unknown,
): EditorState | null => {
  if (typeof params !== "object" || params === null) return null;
  const p = params as { uri?: unknown; typeId?: unknown };
  if (typeof p.uri !== "string" || typeof p.typeId !== "string") return null;
  return { uri: p.uri, typeId: p.typeId, panelId };
};

const pruneAgainstRegistry = (prefs: WorkbenchPrefs): WorkbenchPrefs =>
  prunePrefs(prefs, {
    activities: new Set(workbenchRegistry.activities().map((a) => a.id)),
    editorTypes: new Set(workbenchRegistry.editorTypes().map((t) => t.id)),
    views: new Set(workbenchRegistry.views().map((v) => v.id)),
    perTypePersistableViews: new Set(
      workbenchRegistry
        .views()
        .filter((v) => v.whenEditor)
        .map((v) => v.id),
    ),
  });

const initialPrefs = (): WorkbenchPrefs => {
  const loaded = loadPrefs();
  const pruned = pruneAgainstRegistry(loaded);
  if (pruned !== loaded) savePrefs(pruned);
  return pruned;
};

// Default editor URI to open when the workbench boots with an empty dock
// and the active activity carries no `defaultEditor`. Overview is the
// landing surface (lowest-order activity since Home was removed).
const FALLBACK_BOOT_URI: EditorUri = "overview://";

export const useWorkbenchStore = create<WorkbenchStore>()(
  subscribeWithSelector((set, get) => {
    const initial = initialPrefs();
    return {
      prefs: initial,
      editors: [],
      activeEditor: null,
      activeActivity: initial.activeActivity,
      dockviewReady: false,
      openViewIds: new Set<ViewId>(),
      _dockviewApi: null,
      _pendingOpens: [],
      _saveTimer: null,
      _pinnedWidthSaveTimer: null,
      _beforeUnloadHandler: null,
      seenViews: new Set<ViewId>(),
      hiddenViews: new Set<ViewId>(),
      _suppressActiveTracking: false,
      _suppressHideTracking: false,

      _updatePrefs: (mut) => {
        const next = mut(get().prefs);
        savePrefs(next);
        set({ prefs: next });
      },

      _syncFromDockview: () => {
        const dv = get()._dockviewApi;
        if (!dv) return;
        const nextEditors: EditorState[] = [];
        const nextOpenViews = new Set<ViewId>();
        for (const panel of dv.panels) {
          const state = editorStateFromParams(panel.id, panel.params);
          if (state) nextEditors.push(state);
          const viewId = viewIdFromPanelId(panel.id);
          if (viewId) nextOpenViews.add(viewId);
        }
        set({ editors: nextEditors });
        // Ne re-set que si l'ensemble a réellement changé : `_syncFromDockview`
        // fire à chaque tick de drag, inutile de réveiller les abonnés sinon.
        const curOpen = get().openViewIds;
        const changed =
          curOpen.size !== nextOpenViews.size ||
          [...nextOpenViews].some((id) => !curOpen.has(id));
        if (changed) set({ openViewIds: nextOpenViews });

        // `activeEditor` tracks the focused **editor**, not whichever panel
        // dockview happens to have active. When the active panel is a view
        // (e.g. chat focused via tab click), keep the previous activeEditor
        // — otherwise WorkbenchRouterSync would navigate as if every editor
        // closed every time a view took focus. If the previous editor is no
        // longer in the dock (closed), fall back to null.
        const activePanel = dv.activePanel;
        const cur = get().activeEditor;
        const editorActive =
          activePanel && !isViewPanelId(activePanel.id)
            ? (nextEditors.find((e) => e.panelId === activePanel.id) ?? null)
            : cur
              ? (nextEditors.find((e) => e.panelId === cur.panelId) ?? null)
              : null;
        if ((cur?.panelId ?? null) !== (editorActive?.panelId ?? null)) {
          set({ activeEditor: editorActive });
        }
      },

      openEditor: (uri, opts) => {
        const type = workbenchRegistry.editorTypeFor(uri);
        if (!type) {
          throw new Error(`Workbench: no editor type registered for "${uri}"`);
        }
        const panelId = uri;
        const editorState: EditorState = { uri, typeId: type.id, panelId };

        const dv = get()._dockviewApi;
        if (!dv) {
          get()._pendingOpens.push({ uri, opts });
          return editorState;
        }

        let panel = dv.getPanel(panelId);
        if (!panel) {
          const tabComponent = type.tab
            ? workbenchTabComponentForType(type.id)
            : WORKBENCH_TAB_COMPONENT;
          // When the watermark is holding the editor area open, open the
          // editor *into its group* so the editor inherits the center slot
          // (the sidebar keeps its width), then tear the placeholder down and
          // restore the group's chrome — otherwise the editor would land as a
          // tab in a view group, or in a header-hidden/locked group.
          const watermark = dv.getPanel(WATERMARK_PANEL_ID);
          // Where to land the editor:
          // - watermark present (first editor): open *into its group* so it
          //   inherits the center slot, then tear the placeholder down below.
          // - no watermark (subsequent editors): stack as a tab in an existing
          //   editor's group. Without this, `position: undefined` makes dockview
          //   drop the panel into the *active* group — which is usually a
          //   sidebar view (e.g. the left Plugins panel), so the editor would
          //   render off in the sidebar instead of the center.
          const existingEditor = watermark ? null : findEditorPanel(dv);
          const position = watermark
            ? ({ referencePanel: WATERMARK_PANEL_ID, direction: "within" } as const)
            : existingEditor
              ? ({ referencePanel: existingEditor.api.id, direction: "within" } as const)
              : undefined;
          // Spec sidebar-user-controlled-width §3 — adding a panel rebalances
          // the dock proportionally; wrap so the post-mutation re-pin pulls
          // the sidebar back to its pinned px width.
          let created!: IDockviewPanel;
          withSidebarPinned(dv, () => {
            created = dv.addPanel<EditorPanelParams>({
              id: panelId,
              component: type.id,
              tabComponent,
              title: type.title(uri),
              params: { uri, typeId: type.id },
              position,
            });
            if (watermark) {
              created.group.header.hidden = false;
              created.group.locked = false;
              watermark.api.close();
            }
          });
          panel = created;
        } else {
          const nextTitle = type.title(uri);
          if (panel.api.title !== nextTitle) panel.api.setTitle(nextTitle);
        }
        if (opts?.focus !== false) panel.api.setActive();
        return editorState;
      },

      closeEditor: (uri) => {
        const dv = get()._dockviewApi;
        const panel = dv?.getPanel(uri);
        if (!dv || !panel) return;
        withSidebarPinned(dv, () => panel.api.close());
      },

      closeEditorByPanel: (panelId) => {
        const dv = get()._dockviewApi;
        const panel = dv?.getPanel(panelId);
        if (!dv || !panel) return;
        withSidebarPinned(dv, () => panel.api.close());
      },

      setDockviewApi: (dv) => {
        set({ _dockviewApi: dv, dockviewReady: true });

        const persisted = loadPrefs();
        // Spec secondary-sidebar-user-controlled-width — seed the module-level
        // pinned width per side from prefs so the very first re-pin (after
        // fromJSON or the reconciler adding the anchor view) applies the
        // user's value rather than the proportional width baked into the
        // snapshot.
        setPinnedWidthPx("left", persisted.primarySidebar.expandedSizePx);
        setPinnedWidthPx("right", persisted.secondarySidebar.expandedSizePx);

        // Spec §6 : un seul snapshot global. Plus de partitionnement par
        // activité — l'activity bar n'a plus à éclater le layout.
        let restored = false;
        if (persisted.dockLayout) {
          try {
            dv.fromJSON(
              persisted.dockLayout as Parameters<DockviewApi["fromJSON"]>[0],
            );
            // Tear down editor panels whose scheme no longer maps to an editor
            // type — happens when a plugin is removed between sessions.
            for (const panel of dv.panels) {
              const state = editorStateFromParams(panel.id, panel.params);
              if (!state) continue;
              const type = workbenchRegistry.editorTypeFor(state.uri);
              if (!type) panel.api.close();
            }
            // Strip view panels for views that no longer have a contribution.
            // The reconciler will re-add eligible views in its next pass.
            for (const panel of [...dv.panels]) {
              const viewId = viewIdFromPanelId(panel.id);
              if (viewId && !workbenchRegistry.getView(viewId)) {
                panel.api.close();
              }
            }
            // Never restore a persisted watermark: its header-hidden/locked
            // group state isn't reliably serialised, and the reconciler re-adds
            // it cleanly when it observes the (post-restore) editor-less dock.
            dv.getPanel(WATERMARK_PANEL_ID)?.api.close();
            restored = dv.panels.length > 0;
            // Spec secondary-sidebar-user-controlled-width — the snapshot
            // encodes proportional widths; assert the pinned px width on both
            // anchor groups so neither sidebar reopens at its serialised share.
            ensureSidebarConstraints(dv, "left");
            ensureSidebarConstraints(dv, "right");
            pinSidebarWidth(dv, "left");
            pinSidebarWidth(dv, "right");
          } catch {
            /* corrupt snapshot, ignore */
          }
        }

        if (!restored) {
          // Fresh dock (no snapshot or unusable one): open the active activity's
          // defaultEditor, falling back to `overview://` so the user always
          // lands on something — never an empty workbench.
          const currentActivity = get().activeActivity;
          const activity = currentActivity
            ? workbenchRegistry.getActivity(currentActivity)
            : null;
          const fallbackUri = activity?.defaultEditor ?? FALLBACK_BOOT_URI;
          // Only attempt to open if a matching editor type is registered;
          // otherwise leave the dock empty (Watermark takes over).
          if (workbenchRegistry.editorTypeFor(fallbackUri)) {
            get().openEditor(fallbackUri, { focus: true });
          }
        }

        // Flushes the latest dockview snapshot to localStorage AND mirrors it
        // into `store.prefs.dockLayout`. The mirror is load-bearing: without
        // it, the next `_updatePrefs` (toggle sidebar, switch activity, click
        // a view tab, sash-drag flush, ...) writes the *boot-time*
        // `store.prefs` to localStorage and clobbers the layout we just saved.
        const flushDockLayoutNow = () => {
          try {
            const json = dv.toJSON();
            const next: WorkbenchPrefs = { ...get().prefs, dockLayout: json };
            savePrefs(next);
            set({ prefs: next });
          } catch {
            /* serialization failed, skip */
          }
        };

        const scheduleSave = () => {
          const prev = get()._saveTimer;
          if (prev !== null) window.clearTimeout(prev);
          const t = window.setTimeout(() => {
            set({ _saveTimer: null });
            flushDockLayoutNow();
          }, 250);
          set({ _saveTimer: t });
        };

        // Debounced persist for the two anchor groups' pinned width. A sash
        // drag fires `onDidLayoutChange` on every pixel — coalescing avoids a
        // localStorage write per tick. 250 ms matches `scheduleSave` so the
        // sidebar widths and the layout snapshot land together. A single
        // timer is enough: dockview only drags one side at a time, and the
        // pending values are keyed by side so concurrent updates merge cleanly.
        let pendingPinnedPx: Partial<Record<SidebarSide, number>> = {};
        const flushPinnedWidthsNow = () => {
          const pending = pendingPinnedPx;
          pendingPinnedPx = {};
          if (pending.left === undefined && pending.right === undefined) return;
          get()._updatePrefs((p) => ({
            ...p,
            primarySidebar:
              pending.left !== undefined
                ? { ...p.primarySidebar, expandedSizePx: pending.left }
                : p.primarySidebar,
            secondarySidebar:
              pending.right !== undefined
                ? { ...p.secondarySidebar, expandedSizePx: pending.right }
                : p.secondarySidebar,
          }));
        };
        const persistPinnedWidth = (side: SidebarSide, px: number) => {
          pendingPinnedPx[side] = px;
          const prev = get()._pinnedWidthSaveTimer;
          if (prev !== null) window.clearTimeout(prev);
          const t = window.setTimeout(() => {
            set({ _pinnedWidthSaveTimer: null });
            flushPinnedWidthsNow();
          }, 250);
          set({ _pinnedWidthSaveTimer: t });
        };

        // Last-second flush so a debounced layout/width change isn't dropped
        // when the user closes the window within 250 ms of their final
        // action. `beforeunload` runs synchronously and localStorage writes
        // commit synchronously, so the snapshot lands before the renderer
        // tears down. Cleaned up by `disposeDockviewApi`.
        const handleBeforeUnload = () => {
          const wt = get()._pinnedWidthSaveTimer;
          if (wt !== null) {
            window.clearTimeout(wt);
            set({ _pinnedWidthSaveTimer: null });
            flushPinnedWidthsNow();
          }
          const lt = get()._saveTimer;
          if (lt !== null) {
            window.clearTimeout(lt);
            set({ _saveTimer: null });
          }
          // Always re-flush the dock snapshot on unload — covers the case
          // where the last user action skipped `onDidLayoutChange` entirely
          // (e.g. a tab click) yet `store.prefs.dockLayout` is still stale.
          flushDockLayoutNow();
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        set({ _beforeUnloadHandler: handleBeforeUnload });

        dv.onDidLayoutChange(() => {
          get()._syncFromDockview();
          // Spec sidebar-user-controlled-width §4 — only treat a layout
          // change as a sash drag when the dock width and group count are
          // both stable; every other case re-pins so the sidebar holds its
          // pixel width through window resizes and unwrapped mutations.
          maybeRecordSidebarDrag(dv, persistPinnedWidth);
          scheduleSave();
        });
        dv.onDidActivePanelChange((panel) => {
          get()._syncFromDockview();
          // Spec §2.3 — when the user clicks a view tab in the left anchor
          // group, remember it as that editor type's preferred left view.
          // Reconciler-initiated activations (auto-switch on editor change)
          // are filtered out via `_suppressActiveTracking` — otherwise the
          // reconciler would echo its own pick back into prefs and shadow
          // the user's actual choice.
          if (get()._suppressActiveTracking) return;
          if (!panel) return;
          const viewId = viewIdFromPanelId(panel.id);
          if (!viewId) return;
          const view = workbenchRegistry.getView(viewId);
          if (!view) return;
          if (getViewLocation(view) !== "left") return;
          // Spec workbench-view-lifecycle-ux §3.2 — split the global vs.
          // per-type persistence model with a single pure predicate. Contextual
          // views (whose `whenEditor` matches the active editor) are remembered
          // PER editor type; global views go into a single `lastActiveLeftView`.
          // This replaces the ad-hoc `defaultPrimaryView` guard: a casual click
          // on Explorer/Runs no longer shadows the editor's default primary
          // because it lands in the global slot, not the per-type map.
          const editor = get().activeEditor;
          if (isPrimaryPersistablePerType(view, editor)) {
            get().setActiveViewForEditorType(editor?.typeId ?? "default", viewId);
          } else {
            get().setLastActiveLeftView(viewId);
          }
        });
        // Closing a view panel (X button, drag-out, etc.) marks the view as
        // hidden so the additive reconciler doesn't immediately re-add it.
        // The user has to opt back in via ActivityBar / palette / `showView`.
        dv.onDidRemovePanel((panel) => {
          const viewId = viewIdFromPanelId(panel.id);
          if (!viewId) return;
          // Spec workbench-view-lifecycle-ux §1.2 — auto-removal of an
          // inéligible `contextual` view (driven by the reconciler) raises this
          // flag so we DON'T record it as a user hide. Otherwise the view would
          // be stuck in `hiddenViews` and never re-appear when its context
          // returns.
          if (get()._suppressHideTracking) return;
          // Spec §2 invariants: unregistration tears down the panel but
          // doesn't constitute a user "hide" — skip the side-effect.
          if (!workbenchRegistry.getView(viewId)) return;
          set((s) => {
            if (s.hiddenViews.has(viewId)) return s;
            const next = new Set(s.hiddenViews);
            next.add(viewId);
            return { ...s, hiddenViews: next };
          });
        });

        // Reconstruct `seenViews` from the restored snapshot — every view
        // panel present in the dock has, by definition, already been seen.
        // Spec §2 invariants: keeps the store consistent without persisting
        // a third drift vector alongside `dockLayout` snapshot.
        const initialSeen = new Set<ViewId>();
        for (const panel of dv.panels) {
          const viewId = viewIdFromPanelId(panel.id);
          if (viewId) initialSeen.add(viewId);
        }
        if (initialSeen.size > 0) {
          set({ seenViews: initialSeen });
        }

        const pending = get()._pendingOpens.splice(0);
        for (const { uri, opts } of pending) {
          get().openEditor(uri, opts);
        }
        get()._syncFromDockview();
      },

      disposeDockviewApi: () => {
        const t = get()._saveTimer;
        if (t !== null) window.clearTimeout(t);
        const wt = get()._pinnedWidthSaveTimer;
        if (wt !== null) window.clearTimeout(wt);
        const onUnload = get()._beforeUnloadHandler;
        if (onUnload) window.removeEventListener("beforeunload", onUnload);
        set({
          _dockviewApi: null,
          _pendingOpens: [],
          _saveTimer: null,
          _pinnedWidthSaveTimer: null,
          _beforeUnloadHandler: null,
          dockviewReady: false,
        });
      },

      // Spec §5 : l'activity bar ne fragmente plus rien. `activateActivity`
      // se réduit à un setter de l'activité courante (filtre cosmétique +
      // `activity:` binding sur les vues bound à une activité, géré par le
      // reconciler). Plus de snapshot/restore par activité.
      activateActivity: (id) => {
        if (get().activeActivity === id) return;
        get()._updatePrefs((prev) => ({ ...prev, activeActivity: id }));
        set({ activeActivity: id });
      },

      setActiveViewForEditorType: (typeId, viewId) => {
        get()._updatePrefs((prev) => {
          const cur = prev.activeViewByEditorType[typeId] ?? null;
          if (cur === viewId) return prev;
          return {
            ...prev,
            activeViewByEditorType: {
              ...prev.activeViewByEditorType,
              [typeId]: viewId,
            },
          };
        });
      },

      setLastActiveLeftView: (viewId) => {
        get()._updatePrefs((prev) => {
          if (prev.lastActiveLeftView === viewId) return prev;
          return { ...prev, lastActiveLeftView: viewId };
        });
      },

      showView: (id) => {
        const view = workbenchRegistry.getView(id);
        if (!view) return;
        // Always clear `hiddenViews` first — the user explicitly wants the view.
        set((s) => {
          if (!s.hiddenViews.has(id)) return s;
          const next = new Set(s.hiddenViews);
          next.delete(id);
          return { ...s, hiddenViews: next };
        });
        const dv = get()._dockviewApi;
        if (!dv) return;
        const panel = dv.getPanel(viewPanelId(id));
        if (panel) {
          panel.api.setActive();
          return;
        }
        // No panel yet: re-materialise at the last known location if we
        // captured one at the previous `hideView`, otherwise fall back to
        // `defaultLocation` (spec §2.2).
        const memo = get().prefs.viewLocations[id];
        addViewPanel(dv, view, {
          focus: true,
          locationOverride: memo?.location,
          floating: memo?.floating,
        });
        set((s) => {
          if (s.seenViews.has(id)) return s;
          const next = new Set(s.seenViews);
          next.add(id);
          return { ...s, seenViews: next };
        });
      },

      // Bascule l'ouverture d'une vue : la ferme si son panneau est monté,
      // l'ouvre sinon. Utilisé par les boutons ActivityBar en mode launcher
      // (ex. Terminal) pour un comportement toggle. La présence du panneau dans
      // le dockview est l'unique source de vérité de l'état « ouverte ».
      toggleView: (id) => {
        const view = workbenchRegistry.getView(id);
        if (!view) return;
        const dv = get()._dockviewApi;
        const open = Boolean(dv?.getPanel(viewPanelId(id)));
        if (open) get().hideView(id);
        else get().showView(id);
      },

      hideView: (id) => {
        const view = workbenchRegistry.getView(id);
        if (!view) return;
        // Capture the panel's current location *before* tearing it down so
        // `showView` can put it back at the same border (spec §2.2). Skip if
        // dockview can't tell us the location — fallback to defaultLocation
        // is implicit in `showView`.
        const dv = get()._dockviewApi;
        const panel = dv?.getPanel(viewPanelId(id));
        if (panel) {
          const dvLoc = panel.api.location;
          const floating = dvLoc.type === "floating" || dvLoc.type === "popout";
          // Spec workbench-view-lifecycle-ux §4.2 — capture the real border the
          // group sits at (classified from its geometry) instead of approximating
          // from `defaultLocation`, so a DnD-moved view returns to where the user
          // left it. Falls back to `defaultLocation` when the border can't be
          // inferred (e.g. floating).
          const location = resolveDockLocation(panel, getViewLocation(view));
          get()._updatePrefs((prev) => ({
            ...prev,
            viewLocations: {
              ...prev.viewLocations,
              [id]: { location, floating },
            },
          }));
        }
        set((s) => {
          if (s.hiddenViews.has(id)) return s;
          const next = new Set(s.hiddenViews);
          next.add(id);
          return { ...s, hiddenViews: next };
        });
        if (panel && dv) {
          // Spec sidebar-user-controlled-width §3 — closing a view panel
          // rebalances; keep the sidebar's pinned width.
          withSidebarPinned(dv, () => panel.api.close());
        }
      },

      // Spec §7 / PR 4 : les toggle* persistent l'état de pli des bordures
      // dans les prefs. Le câblage visuel (collapse de groupes d'ancrage via
      // dockview edge groups) est repoussé à PR 4 — pour PR 2c on conserve
      // l'API publique stable et la persistance, mais l'effet visuel des
      // toggles n'est pas (encore) rétabli depuis le démantèlement des
      // slot-hosts.
      togglePrimarySidebar: () => {
        get()._updatePrefs((prev) => ({
          ...prev,
          primarySidebar: {
            ...prev.primarySidebar,
            collapsed: !prev.primarySidebar.collapsed,
          },
        }));
      },

      toggleSecondarySidebar: () => {
        get()._updatePrefs((prev) => ({
          ...prev,
          secondarySidebar: {
            ...prev.secondarySidebar,
            collapsed: !prev.secondarySidebar.collapsed,
          },
        }));
      },

      toggleBottomDock: () => {
        get()._updatePrefs((prev) => ({
          ...prev,
          bottomDock: {
            ...prev.bottomDock,
            collapsed: !prev.bottomDock.collapsed,
          },
        }));
      },

      setTemplateEditorGridSnap: (next) => {
        get()._updatePrefs((prev) => ({
          ...prev,
          templateEditor: {
            ...prev.templateEditor,
            gridSnap: {
              enabled:
                typeof next.enabled === "boolean"
                  ? next.enabled
                  : prev.templateEditor.gridSnap.enabled,
              size:
                typeof next.size === "number"
                  ? clampGridSnapSize(next.size)
                  : prev.templateEditor.gridSnap.size,
            },
          },
        }));
      },

      setTemplateEditorInspectorWidth: (px) => {
        const clamped = clampInspectorWidth(px);
        get()._updatePrefs((prev) => {
          if (prev.templateEditor.inspectorWidthPx === clamped) return prev;
          return {
            ...prev,
            templateEditor: {
              ...prev.templateEditor,
              inspectorWidthPx: clamped,
            },
          };
        });
      },

      listEditors: () => {
        const dv = get()._dockviewApi;
        if (!dv) return [];
        const out: EditorState[] = [];
        for (const panel of dv.panels) {
          const state = editorStateFromParams(panel.id, panel.params);
          if (state) out.push(state);
        }
        return out;
      },
    };
  }),
);

// Re-prune against the current registry. Called by the Provider on mount as
// a safety net: contributions registered after the store was first imported
// (rare, but possible under HMR) wouldn't have been considered by
// `initialPrefs()`. Idempotent — no-op when prefs are already clean.
export const prunePrefsAgainstRegistry = (): void => {
  const cur = useWorkbenchStore.getState().prefs;
  const next = pruneAgainstRegistry(cur);
  if (next !== cur) {
    savePrefs(next);
    useWorkbenchStore.setState({ prefs: next });
  }
};

// Legacy bridge for `WorkbenchApi.subscribe`. Translates string events to
// store.subscribe selector listeners. Kept for compatibility with consumers
// that haven't migrated to direct `useWorkbenchStore.subscribe(selector, ...)`.
const subscribeLegacy = (
  event: WorkbenchEvent,
  handler: () => void,
): (() => void) => {
  switch (event) {
    case "activeEditorChanged":
      return useWorkbenchStore.subscribe(
        (s) => s.activeEditor,
        () => handler(),
      );
    case "editorsChanged":
      return useWorkbenchStore.subscribe(
        (s) => s.editors,
        () => handler(),
      );
    case "activityChanged":
      return useWorkbenchStore.subscribe(
        (s) => s.activeActivity,
        () => handler(),
      );
    case "viewChanged":
      return useWorkbenchStore.subscribe(
        (s) => s.prefs,
        () => handler(),
        {
          equalityFn: (a, b) =>
            a.primarySidebar === b.primarySidebar &&
            a.secondarySidebar === b.secondarySidebar &&
            a.bottomDock === b.bottomDock,
        },
      );
  }
};

// Stable `WorkbenchApi` object. Methods read the latest action implementations
// from the store on each call, so the api reference itself never changes — safe
// to hold across renders and pass to useEffect deps.
const api: WorkbenchApi = {
  openEditor: (uri, opts) =>
    useWorkbenchStore.getState().openEditor(uri, opts),
  closeEditor: (uri) => useWorkbenchStore.getState().closeEditor(uri),
  closeEditorByPanel: (panelId) =>
    useWorkbenchStore.getState().closeEditorByPanel(panelId),
  activeEditor: () => useWorkbenchStore.getState().activeEditor,
  listEditors: () => useWorkbenchStore.getState().listEditors(),
  showView: (id) => useWorkbenchStore.getState().showView(id),
  hideView: (id) => useWorkbenchStore.getState().hideView(id),
  toggleView: (id) => useWorkbenchStore.getState().toggleView(id),
  togglePrimarySidebar: () =>
    useWorkbenchStore.getState().togglePrimarySidebar(),
  toggleSecondarySidebar: () =>
    useWorkbenchStore.getState().toggleSecondarySidebar(),
  toggleBottomDock: () => useWorkbenchStore.getState().toggleBottomDock(),
  activateActivity: (id) => useWorkbenchStore.getState().activateActivity(id),
  activeActivity: () => useWorkbenchStore.getState().activeActivity,
  subscribe: (event, handler) => subscribeLegacy(event, handler),
};

export const useWorkbench = (): WorkbenchApi => api;

export const useWorkbenchState = (): WorkbenchState =>
  useWorkbenchStore(
    useShallow((s) => ({
      prefs: s.prefs,
      editors: s.editors,
      activeEditor: s.activeEditor,
      activeActivity: s.activeActivity,
      dockviewReady: s.dockviewReady,
      openViewIds: s.openViewIds,
    })),
  );

export const useActiveEditor = (): EditorState | null =>
  useWorkbenchStore((s) => s.activeEditor);

export const useActiveActivity = (): ActivityId | null =>
  useWorkbenchStore((s) => s.activeActivity);

export const useWorkbenchPrefs = (): WorkbenchPrefs =>
  useWorkbenchStore((s) => s.prefs);

export const useTemplateEditorGridSnap = (): WorkbenchPrefs["templateEditor"]["gridSnap"] =>
  useWorkbenchStore((s) => s.prefs.templateEditor.gridSnap);

export const setTemplateEditorGridSnap = (
  next: Partial<WorkbenchPrefs["templateEditor"]["gridSnap"]>,
): void => useWorkbenchStore.getState().setTemplateEditorGridSnap(next);

export const useTemplateEditorInspectorWidth = (): number =>
  useWorkbenchStore((s) => s.prefs.templateEditor.inspectorWidthPx);

export const setTemplateEditorInspectorWidth = (px: number): void =>
  useWorkbenchStore.getState().setTemplateEditorInspectorWidth(px);

export const useEditors = (): ReadonlyArray<EditorState> =>
  useWorkbenchStore((s) => s.editors);

export const useDockviewReady = (): boolean =>
  useWorkbenchStore((s) => s.dockviewReady);
