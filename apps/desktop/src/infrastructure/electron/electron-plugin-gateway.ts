import type { PluginGateway } from "../../application/ports/plugin-gateway";
import type {
  PluginListEntry,
  PluginPermissionMeta,
} from "../../domain/plugin/types";

/**
 * Electron adapter for {@link PluginGateway}. The only renderer-side file that
 * is allowed to reference `window.api.plugins.*` directly — everything else
 * depends on the port.
 *
 * The shapes returned by `window.api.plugins.list/listPermissions` are
 * already structurally identical to the domain types declared in
 * `domain/plugin/types.ts` (the main process produces JSON-serialisable
 * snapshots), so we cast through `unknown` to express the boundary crossing
 * without paying for a defensive copy.
 */
export const createElectronPluginGateway = (): PluginGateway => ({
  async list() {
    const raw = (await window.api.plugins.list()) as unknown;
    return raw as ReadonlyArray<PluginListEntry>;
  },
  async listPermissions() {
    const raw = (await window.api.plugins.listPermissions()) as unknown;
    return raw as ReadonlyArray<PluginPermissionMeta>;
  },
  async invoke(pluginId, method, args) {
    return window.api.plugins.invoke(pluginId, method, args);
  },
  async grant(input) {
    const raw = (await window.api.plugins.grant(input)) as unknown;
    return raw as PluginListEntry | null;
  },
  async setPermission(input) {
    const raw = (await window.api.plugins.setPermission(input)) as unknown;
    return raw as PluginListEntry | null;
  },
  async setEnabled(input) {
    const raw = (await window.api.plugins.setEnabled(input)) as unknown;
    return raw as PluginListEntry | null;
  },
  async reload(input) {
    const raw = (await window.api.plugins.reload(input)) as unknown;
    return raw as PluginListEntry | null;
  },
  async openFolder(input) {
    await window.api.plugins.openFolder(input ?? {});
  },
});
