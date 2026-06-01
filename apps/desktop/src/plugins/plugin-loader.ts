/**
 * Renderer-side plugin loader. Reads the snapshot of loaded plugins from the
 * main process through the {@link PluginGateway} port, then for each plugin
 * that declares a `renderer` entry dynamically imports
 * `plugin://<id>/<renderer>` and calls `onload(uiApi)` with a per-plugin
 * {@link UiPluginApi}.
 *
 * The loader takes its dependencies in input (gateway + UI api factory) so it
 * stays decoupled from `window.api`: only the
 * `infrastructure/electron/electron-plugin-gateway.ts` adapter knows about
 * `window.api.plugins.*`, and the gateway is wired through `buildServices()`.
 *
 * Hardened against the obvious failure modes:
 *  - the gateway call is awaited; a failure aborts the load (the rest of the
 *    UI still mounts — workbench features register themselves at import time
 *    and are independent of this path),
 *  - each plugin is loaded inside its own try/catch so one bad bundle does
 *    not prevent the others from booting,
 *  - we never throw — failures are logged with `[plugin:<id>]` so they show
 *    up in the same console column as the main-side log.
 */
import type { PluginGateway } from "../application/ports/plugin-gateway";
import type { PluginListEntry } from "../domain/plugin/types";
import { createUiPluginApi } from "./ui-plugin-api";

type RendererPluginModule = {
  onload?: (api: ReturnType<typeof createUiPluginApi>) => void | Promise<void>;
  onunload?: (
    api: ReturnType<typeof createUiPluginApi>,
  ) => void | Promise<void>;
};

const loadOne = async (
  entry: PluginListEntry,
  gateway: PluginGateway,
): Promise<void> => {
  if (!entry.renderer) return;
  const prefix = `[plugin:${entry.id}]`;
  const url = `plugin://${entry.id}/${entry.renderer.replace(/^\/+/, "")}`;
  let mod: RendererPluginModule;
  try {
    mod = (await import(/* @vite-ignore */ url)) as RendererPluginModule;
  } catch (err) {
    console.error(
      `${prefix} failed to import renderer bundle: ${(err as Error).stack ?? (err as Error).message}`,
    );
    return;
  }
  if (!mod.onload) {
    console.warn(
      `${prefix} renderer bundle has no \`onload\` export — nothing to register`,
    );
    return;
  }
  const api = createUiPluginApi(entry.id, gateway);
  try {
    await mod.onload(api);
    console.log(`${prefix} renderer onload completed`);
  } catch (err) {
    console.error(
      `${prefix} onload threw: ${(err as Error).stack ?? (err as Error).message}`,
    );
  }
};

export const bootRendererPlugins = async (
  gateway: PluginGateway,
): Promise<void> => {
  let entries: ReadonlyArray<PluginListEntry>;
  try {
    entries = await gateway.list();
  } catch (err) {
    console.error(
      `[plugins] failed to list plugins from main: ${(err as Error).message}`,
    );
    return;
  }
  // Load sequentially: cheap (handful of plugins), and the deterministic
  // order makes ActivityBar ordering predictable without relying on `order`.
  for (const entry of entries) {
    await loadOne(entry, gateway);
  }
};
