/**
 * Renderer-side plugin registry — single source of truth for everything a
 * renderer plugin has contributed (pages, settings tabs, future surfaces).
 *
 * Built around two ideas:
 *
 *  1. **Bridging to the workbench.** Pages are forwarded to `workbenchRegistry`
 *     as activity + view contributions, so they participate in the existing
 *     layout machinery (ActivityBar buttons, primary sidebar slot). We could
 *     have let plugins call `workbenchRegistry` directly, but routing through
 *     here lets us (a) wrap their rendered content in an ErrorBoundary, and
 *     (b) hold a back-reference so a future "unload plugin" implementation
 *     knows what to retract.
 *
 *  2. **Settings tabs are owned here.** The Settings editor subscribes to
 *     this registry so plugins can add their own category without modifying
 *     `SettingsEditor.tsx`. A tiny pub/sub keeps the editor in sync.
 */
import type { LucideIcon } from "lucide-react";
import { createElement, type ReactNode } from "react";
import { workbenchRegistry } from "../ui/workbench/registry";
import PluginErrorBoundary from "./PluginErrorBoundary";
import type { UiPluginPageContribution } from "./ui-plugin-api";

export type SettingsTabContribution = {
  id: string;
  label: string;
  icon?: LucideIcon;
  element: ReactNode;
};

/** Snapshot of one settings tab in the registry, with the source plugin id. */
export type SettingsTabEntry = SettingsTabContribution & {
  readonly pluginId: string;
};

type Listener = () => void;

const settingsTabs: SettingsTabEntry[] = [];
let settingsTabsSnapshot: ReadonlyArray<SettingsTabEntry> = [];
const settingsListeners = new Set<Listener>();
const knownPluginIds = new Set<string>();

const notify = (set: Set<Listener>): void => {
  for (const fn of set) fn();
};

const refreshSettingsTabsSnapshot = (): void => {
  settingsTabsSnapshot = [...settingsTabs];
};

export const rendererPluginRegistry = {
  /**
   * Adds a top-level page contribution for a plugin. Internally registers an
   * activity and — depending on which surfaces the page declares — a primary
   * sidebar view and/or an editor-area editor type. Both rendered subtrees
   * are wrapped in a {@link PluginErrorBoundary} so a runtime error in the
   * plugin's render path does not propagate to the workbench shell.
   *
   * `mainView` is wired by synthesising a `plugin-<pluginId>-<pageId>` URI
   * scheme and registering an editor type for it; the activity's
   * `defaultEditor` then points at `<scheme>://main`, so clicking the
   * ActivityBar button opens the plugin's editor exactly like a built-in
   * feature would.
   */
  addPage(pluginId: string, page: UiPluginPageContribution): void {
    const activityId = `plugin:${pluginId}:${page.id}`;
    const viewId = `${activityId}:view`;
    const editorScheme = `plugin-${pluginId}-${page.id}`;
    const editorTypeId = `${activityId}:editor`;
    const editorUri = `${editorScheme}://main`;
    knownPluginIds.add(pluginId);

    workbenchRegistry.registerActivity({
      id: activityId,
      title: page.title,
      icon: page.icon,
      order: page.order ?? 500,
      placement: page.placement ?? "top",
      defaultView: page.sidebar !== undefined ? viewId : undefined,
      defaultEditor: page.mainView !== undefined ? editorUri : undefined,
    });

    if (page.sidebar !== undefined) {
      workbenchRegistry.registerView({
        id: viewId,
        defaultLocation: "left",
        title: page.title,
        icon: page.icon,
        activity: activityId,
        render: () =>
          createElement(PluginErrorBoundary, {
            pluginId,
            fallbackTitle: page.title,
            children: page.sidebar,
          }),
      });
    }

    if (page.mainView !== undefined) {
      workbenchRegistry.registerEditorType({
        id: editorTypeId,
        scheme: editorScheme,
        title: () => page.title,
        icon: () => page.icon,
        render: () =>
          createElement(PluginErrorBoundary, {
            pluginId,
            fallbackTitle: page.title,
            children: page.mainView,
          }),
      });
    }
  },

  registerSettingsTab(pluginId: string, tab: SettingsTabContribution): void {
    knownPluginIds.add(pluginId);
    // De-dupe by `(pluginId, id)` — re-registration replaces the previous tab,
    // useful when HMR re-runs the plugin's `onload`.
    const idx = settingsTabs.findIndex(
      (t) => t.pluginId === pluginId && t.id === tab.id,
    );
    const entry: SettingsTabEntry = { ...tab, pluginId };
    if (idx >= 0) settingsTabs[idx] = entry;
    else settingsTabs.push(entry);
    refreshSettingsTabsSnapshot();
    notify(settingsListeners);
  },

  /** Snapshot of every registered settings tab. Stable reference between changes. */
  listSettingsTabs(): ReadonlyArray<SettingsTabEntry> {
    return settingsTabsSnapshot;
  },

  /** Subscribe to settings-tab list changes. Returns an unsubscribe handle. */
  subscribeSettingsTabs(fn: Listener): () => void {
    settingsListeners.add(fn);
    return () => settingsListeners.delete(fn);
  },

  /** Read-only snapshot of plugin ids that have made at least one contribution. */
  knownPluginIds(): ReadonlyArray<string> {
    return [...knownPluginIds];
  },
} as const;

export type RendererPluginRegistry = typeof rendererPluginRegistry;
