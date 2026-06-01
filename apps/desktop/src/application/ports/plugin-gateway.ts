import type {
  PluginGrantInput,
  PluginListEntry,
  PluginPermissionMeta,
  PluginSetEnabledInput,
  PluginSetPermissionInput,
} from "../../domain/plugin/types";

/**
 * Port abstracting the renderer-side plugin surface. The Electron adapter
 * forwards each method to `window.api.plugins.*`; any other adapter (mock,
 * test, future WebSocket back-end) implements the same contract.
 *
 * All renderer code that needs to talk to the plugin subsystem MUST depend on
 * this port — no React component is allowed to touch `window.api.plugins`
 * directly (cf. ARCHITECTURE.md §4 "Étage 2 — renderer").
 */
export interface PluginGateway {
  list(): Promise<ReadonlyArray<PluginListEntry>>;
  listPermissions(): Promise<ReadonlyArray<PluginPermissionMeta>>;
  invoke(pluginId: string, method: string, args?: unknown): Promise<unknown>;
  grant(input: PluginGrantInput): Promise<PluginListEntry | null>;
  setPermission(input: PluginSetPermissionInput): Promise<PluginListEntry | null>;
  setEnabled(input: PluginSetEnabledInput): Promise<PluginListEntry | null>;
  reload(input: { pluginId: string }): Promise<PluginListEntry | null>;
  openFolder(input?: { pluginId?: string }): Promise<void>;
}
