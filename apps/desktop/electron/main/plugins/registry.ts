/**
 * In-memory registry of discovered plugins (active or otherwise). The loader
 * populates this; IPC handlers (`plugin:list`, `plugin:setEnabled`,
 * `plugin:grant`, …) read and mutate it.
 *
 * The registry tracks every plugin found on disk, regardless of whether the
 * user has authorized it yet. The `state` field is the discriminator:
 *  - `"active"`  — `onload` ran successfully; `api`/`module` are live.
 *  - `"pending"` — manifest valid, authorization not yet given. `api` is null.
 *  - `"disabled"` — user has explicitly disabled the plugin. `api` is null.
 *  - `"failed"`  — activation threw. `error` carries the message; `api` is null.
 */
import type { StepKindId } from "../wf/domain/template";
import type { PluginApi, PluginIpcHandler, PluginMainModule } from "./api";
import type { PluginManifest } from "./manifest";
import type { Grant } from "./grants";

export type PluginState = "active" | "pending" | "disabled" | "failed";

export type LoadedPlugin = {
  readonly manifest: PluginManifest;
  readonly source: "builtin" | "user";
  readonly rootDir: string;
  readonly api: PluginApi | null;
  readonly module: PluginMainModule | null;
  /**
   * Step kinds this plugin registered via `api.registerStepRunner`.
   * Removed from the engine registry on unload.
   */
  readonly registeredStepKinds: Set<StepKindId>;
  /**
   * RPC methods registered via `api.registerIpcHandler`, keyed by method name.
   * Resolved by the central `plugin:invoke` dispatcher; the routing key on
   * the wire is `{ pluginId, method }` (no global namespace squatting).
   */
  readonly ipcHandlers: Map<string, PluginIpcHandler>;
  /** Lifecycle state — see file header. */
  readonly state: PluginState;
  /** Grant in effect, or `null` when state is `"pending"`. */
  readonly grant: Grant | null;
  /** Populated only when `state === "failed"`. */
  readonly error?: string;
};

export type PluginRegistry = {
  add: (plugin: LoadedPlugin) => void;
  get: (id: string) => LoadedPlugin | undefined;
  list: () => ReadonlyArray<LoadedPlugin>;
  remove: (id: string) => LoadedPlugin | undefined;
};

export const createPluginRegistry = (): PluginRegistry => {
  const byId = new Map<string, LoadedPlugin>();
  return {
    add(plugin) {
      // Re-registration is allowed — the loader uses it after reactivation to
      // flip a plugin from "pending" to "active" without a separate API call.
      byId.set(plugin.manifest.id, plugin);
    },
    get(id) {
      return byId.get(id);
    },
    list() {
      return [...byId.values()];
    },
    remove(id) {
      const plugin = byId.get(id);
      if (!plugin) return undefined;
      byId.delete(id);
      return plugin;
    },
  };
};
