/**
 * IPC handlers for plugin lifecycle and authorization.
 *
 *  - `plugin:list` — declarative snapshot of every discovered plugin, including
 *    its state (`active`/`pending`/`disabled`/`failed`), the permissions it
 *    declares in the manifest, and the subset currently granted by the user.
 *    Used by the Settings page and the renderer-side plugin loader.
 *  - `plugin:listPermissions` — catalog metadata (labels + rationales) used by
 *    the authorization dialog. Cached at construction; immutable per app boot.
 *  - `plugin:invoke` — single dispatcher routing `{ pluginId, method, args }`
 *    to the corresponding handler registered via `api.registerIpcHandler`. The
 *    dispatcher itself bears no permission of its own; the handler executes in
 *    the plugin's own permission context and any gated `api.*` call inside it
 *    rechecks grants.
 *  - `plugin:grant` — persists the user's answer to the authorization dialog
 *    and reactivates the plugin. Idempotent.
 *  - `plugin:setPermission` — toggles a single permission on an existing grant,
 *    used by the "permissions" tab in Settings. Hot — no reload required.
 *  - `plugin:setEnabled` — flips the overall enable flag and reactivates or
 *    deactivates the plugin accordingly.
 *  - `plugin:reload` — re-runs scan + activation for one plugin id. Useful
 *    in development.
 *  - `plugin:openFolder` — reveals the plugin directory in the OS file manager.
 */
import path from "node:path";
import { app, ipcMain, shell } from "electron";
import type { PluginRegistry, LoadedPlugin } from "../plugins/registry";
import {
  reactivateOne,
  deactivatePlugin,
  type SourceDir,
} from "../plugins/loader";
import type { GrantStore } from "../plugins/grants";
import type { StepRunnerRegistry } from "../wf/application/step-runner";
import {
  PERMISSION_CATALOG,
  PERMISSION_IDS,
  type PermissionId,
} from "../plugins/permissions-catalog";

type Deps = {
  registry: PluginRegistry;
  grants: GrantStore;
  runners: StepRunnerRegistry;
  /** Same sources the loader uses; required for live reactivation. */
  sources: ReadonlyArray<SourceDir>;
  pluginDataDirFor: (pluginId: string) => string;
  appVersion: string;
  engineRead: import("../plugins/permissions").PluginEngineReadDeps;
  secretsBackend: import("../plugins/permissions").SecretsBackend;
  artifactSchemas?: import(
    "../wf/application/ports/outbound/artifact-schema-registry"
  ).ArtifactSchemaRegistry;
  parsers?: import(
    "../wf/application/ports/outbound/parser-registry"
  ).ParserRegistry;
  stepKindSuggestions?: import(
    "../wf/application/ports/outbound/step-kind-suggestions"
  ).StepKindSuggestionRegistry;
};

/** Snapshot of a discovered plugin returned by `plugin:list`. */
export type PluginListEntry = {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  source: "builtin" | "user";
  state: "active" | "pending" | "disabled" | "failed";
  /**
   * Core plugin — load-bearing built-in (publishes kinds referenced by
   * legacy templates / on-disk artifacts). The Settings UI uses this to
   * disable the `enabled` toggle; the IPC handler also rejects attempts to
   * flip it off.
   */
  core: boolean;
  /** Manifest-declared permissions (full set requested). */
  declaredPermissions: ReadonlyArray<PermissionId>;
  /** Subset currently granted (subset of declared). */
  grantedPermissions: ReadonlyArray<PermissionId>;
  /** Outgoing host allow-list (when `network` is declared). */
  networkHosts: ReadonlyArray<string>;
  /**
   * Relative path to the renderer entry as declared in the manifest, or
   * `null` when the plugin has no UI half.
   */
  renderer: string | null;
  contributions: {
    stepKinds: ReadonlyArray<{ id: string; label: string; icon?: string }>;
  };
  methods: ReadonlyArray<string>;
  /** Populated when `state === "failed"`. */
  error?: string;
};

const toListEntry = (p: LoadedPlugin): PluginListEntry => ({
  id: p.manifest.id,
  name: p.manifest.name,
  version: p.manifest.version,
  description: p.manifest.description,
  author: p.manifest.author,
  homepage: p.manifest.homepage,
  source: p.source,
  state: p.state,
  core: p.source === "builtin" && p.manifest.core === true,
  declaredPermissions: (p.manifest.permissions ?? []),
  grantedPermissions: p.grant ? [...p.grant.permissions] : [],
  networkHosts: (p.manifest.networkHosts ?? []),
  renderer: p.manifest.renderer ?? null,
  contributions: {
    stepKinds: p.manifest.contributions?.stepKinds ?? [],
  },
  methods: [...p.ipcHandlers.keys()],
  error: p.error,
});

const ALLOWED_PERMISSIONS = new Set<string>(PERMISSION_IDS);

export const registerPluginHandlers = (deps: Deps): void => {
  const {
    registry,
    grants,
    runners,
    sources,
    pluginDataDirFor,
    appVersion,
    engineRead,
    secretsBackend,
    artifactSchemas,
    parsers,
    stepKindSuggestions,
  } = deps;

  const reactivate = (pluginId: string) =>
    reactivateOne(pluginId, sources, {
      registry,
      runners,
      appVersion,
      pluginDataDirFor,
      grants,
      engineRead,
      secretsBackend,
      artifactSchemas,
      parsers,
      stepKindSuggestions,
    });

  ipcMain.handle("plugin:list", (): ReadonlyArray<PluginListEntry> => {
    return registry.list().map(toListEntry);
  });

  ipcMain.handle("plugin:listPermissions", () => {
    return PERMISSION_IDS.map((id) => PERMISSION_CATALOG[id]);
  });

  ipcMain.handle(
    "plugin:invoke",
    async (_e, args: { pluginId: string; method: string; args?: unknown }) => {
      if (!args || typeof args !== "object") {
        throw new Error("plugin:invoke expects { pluginId, method, args? }");
      }
      const { pluginId, method } = args;
      if (typeof pluginId !== "string" || typeof method !== "string") {
        throw new Error("plugin:invoke: pluginId and method must be strings");
      }
      const plugin = registry.get(pluginId);
      if (!plugin) {
        throw new Error(`plugin not loaded: ${pluginId}`);
      }
      if (plugin.state !== "active") {
        throw new Error(
          `[plugin:${pluginId}] is not active (state=${plugin.state}); authorize it from Settings → Plugins first`,
        );
      }
      const handler = plugin.ipcHandlers.get(method);
      if (!handler) {
        throw new Error(`[plugin:${pluginId}] no IPC method: ${method}`);
      }
      try {
        return await handler(args.args);
      } catch (err) {
        const e = err as Error;
        console.error(
          `[plugin:${pluginId}] invoke "${method}" threw: ${e.stack ?? e.message}`,
        );
        throw err;
      }
    },
  );

  ipcMain.handle(
    "plugin:grant",
    async (
      _e,
      args: {
        pluginId: string;
        version: string;
        permissions: ReadonlyArray<string>;
        enabled?: boolean;
      },
    ): Promise<PluginListEntry | null> => {
      if (!args || typeof args !== "object") {
        throw new Error("plugin:grant expects an args object");
      }
      const { pluginId, version, permissions, enabled = true } = args;
      const plugin = registry.get(pluginId);
      if (!plugin) throw new Error(`plugin not found: ${pluginId}`);
      if (plugin.manifest.version !== version) {
        throw new Error(
          `plugin:grant: version mismatch for ${pluginId} (got ${version}, current ${plugin.manifest.version})`,
        );
      }
      // Filter against the manifest's declared permissions — the user can't
      // grant something the plugin didn't ask for.
      const declared = new Set(plugin.manifest.permissions ?? []);
      const sanitised = permissions.filter(
        (p) => ALLOWED_PERMISSIONS.has(p) && declared.has(p as PermissionId),
      );
      grants.set({ pluginId, version, enabled, permissions: sanitised });
      const next = await reactivate(pluginId);
      return next ? toListEntry(next) : null;
    },
  );

  ipcMain.handle(
    "plugin:setPermission",
    async (
      _e,
      args: { pluginId: string; permission: string; granted: boolean },
    ): Promise<PluginListEntry | null> => {
      const { pluginId, permission, granted } = args ?? ({} as never);
      const plugin = registry.get(pluginId);
      if (!plugin) throw new Error(`plugin not found: ${pluginId}`);
      if (!ALLOWED_PERMISSIONS.has(permission)) {
        throw new Error(`unknown permission: ${permission}`);
      }
      const declared = new Set(plugin.manifest.permissions ?? []);
      if (granted && !declared.has(permission as PermissionId)) {
        throw new Error(
          `plugin ${pluginId} does not declare permission "${permission}"`,
        );
      }
      const existing = grants.get(plugin.manifest.id, plugin.manifest.version);
      const current = new Set<string>(
        existing ? [...existing.permissions] : [],
      );
      if (granted) current.add(permission);
      else current.delete(permission);
      grants.set({
        pluginId: plugin.manifest.id,
        version: plugin.manifest.version,
        enabled: existing ? existing.enabled : true,
        permissions: [...current],
      });
      // For most permissions the change is hot (next gated call re-reads
      // grants). `engine:steps` is the exception: revoking it doesn't
      // unregister the runner. We log and let the user reload explicitly.
      if (permission === "engine:steps" && !granted) {
        console.warn(
          `[plugin:${pluginId}] "engine:steps" revoked. Reload the plugin to fully retract its contributed runners.`,
        );
      }
      // Refresh the registry entry so `list` returns the new grant set.
      const updated = await reactivate(pluginId);
      return updated ? toListEntry(updated) : null;
    },
  );

  ipcMain.handle(
    "plugin:setEnabled",
    async (
      _e,
      args: { pluginId: string; enabled: boolean },
    ): Promise<PluginListEntry | null> => {
      const { pluginId, enabled } = args ?? ({} as never);
      const plugin = registry.get(pluginId);
      if (!plugin) throw new Error(`plugin not found: ${pluginId}`);
      // Core built-ins ship kinds (`plugin:<id>:<type>@<v>`) referenced by
      // legacy templates and on-disk artifacts — disabling them would orphan
      // those references. The Settings UI surfaces the same constraint by
      // disabling the toggle; we still defend against a direct IPC call.
      if (
        !enabled &&
        plugin.source === "builtin" &&
        plugin.manifest.core === true
      ) {
        throw new Error(
          `[plugin:${pluginId}] cannot be disabled — it is a core plugin`,
        );
      }
      const existing = grants.get(plugin.manifest.id, plugin.manifest.version);
      const baseline = existing
        ? [...existing.permissions]
        : plugin.source === "builtin"
          ? (plugin.manifest.permissions ?? [])
          : [];
      grants.set({
        pluginId: plugin.manifest.id,
        version: plugin.manifest.version,
        enabled,
        permissions: baseline,
      });
      if (!enabled && plugin.state === "active") {
        await deactivatePlugin(plugin, runners);
      }
      const updated = await reactivate(pluginId);
      return updated ? toListEntry(updated) : null;
    },
  );

  ipcMain.handle(
    "plugin:reload",
    async (
      _e,
      args: { pluginId: string },
    ): Promise<PluginListEntry | null> => {
      const updated = await reactivate(args.pluginId);
      return updated ? toListEntry(updated) : null;
    },
  );

  ipcMain.handle(
    "plugin:openFolder",
    async (_e, args: { pluginId?: string }): Promise<void> => {
      const userRoot = path.join(app.getPath("userData"), "plugins");
      let target = userRoot;
      if (args?.pluginId) {
        const plugin = registry.get(args.pluginId);
        if (plugin && plugin.source === "user") {
          target = plugin.rootDir;
        }
      }
      try {
        await import("node:fs/promises").then((m) =>
          m.mkdir(target, { recursive: true }),
        );
      } catch {
        /* noop */
      }
      await shell.openPath(target);
    },
  );

  console.log("[plugins:ipc] handlers registered");
};
