/**
 * Plugin loader — discovers plugins on disk, validates their manifest, and
 * activates each plugin **only after** authorization has been resolved for the
 * current `(pluginId, version)` pair.
 *
 * Activation flow (cf. PLUGINS.md §4):
 *  1. `scanPlugins(...)` walks the source dirs, validates manifests, and
 *     produces `DiscoveredPlugin` records. No code is required yet.
 *  2. For each discovered plugin, the grant store is consulted:
 *      - built-in: synthesised "all-granted" record (trust-based).
 *      - user, with a matching DB row: use it. If disabled or with a stripped
 *        permission set, the plugin still loads but its API is filtered
 *        accordingly.
 *      - user, no row OR row's permission set is narrower than what the new
 *        manifest version requests: the plugin is marked `pendingGrant` and
 *        skipped. The Settings UI prompts the user to approve.
 *  3. Approved plugins run their `onload(api)` with a permission-filtered
 *     `PluginApi`. Errors during `onload` mark the plugin failed; the others
 *     keep loading.
 *
 * Revocation is *hot*: the `PluginApi` factory captures a `getGrant()` closure
 * that reads the live grant on every call. So revoking from Settings disarms
 * the API at the next invocation without an app restart. Toggling `enabled`
 * off or revoking `engine:steps` is more invasive — those changes require a
 * reload to fully unhook the contribution, surfaced by the Settings UI as
 * "redémarrer le plugin".
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import type { PluginIpcHandler, PluginMainModule } from "./api";
import { PluginManifestSchema, type PluginManifest } from "./manifest";
import type { LoadedPlugin, PluginRegistry } from "./registry";
import type { StepRunnerRegistry } from "../wf/application/step-runner";
import type { StepKindId } from "../wf/domain/template";
import type {
  ArtifactSchemaRegistry,
  PluginArtifactSchemaContribution,
} from "../wf/application/ports/outbound/artifact-schema-registry";
import type {
  ParserRegistry,
  PluginParserContribution,
} from "../wf/application/ports/outbound/parser-registry";
import type {
  PluginStepKindSuggestionContribution,
  StepKindSuggestionRegistry,
} from "../wf/application/ports/outbound/step-kind-suggestions";
import type { ArtifactSchemaRef } from "../wf/domain/artifact-schema";
import type { ArtifactKind } from "../wf/domain/artifact";
import {
  buildPluginApi,
  type BuildApiDeps,
  type PluginEngineReadDeps,
  type SecretsBackend,
} from "./permissions";
import {
  type GrantStore,
  type Grant,
  makeBuiltinGrant,
} from "./grants";
import { IMPLEMENTED_PERMISSIONS } from "./permissions-catalog";

type LoaderDeps = {
  registry: PluginRegistry;
  runners: StepRunnerRegistry;
  /** App version, used to honour `manifest.minAppVersion`. */
  appVersion: string;
  /** Resolves `pluginDataDir` for a given plugin id. */
  pluginDataDirFor: (pluginId: string) => string;
  /** Authorization store; `null` means "skip auth, grant everything" (tests). */
  grants: GrantStore | null;
  /** Read-only engine surface (forwarded to `api.engine` when granted). */
  engineRead?: PluginEngineReadDeps;
  /** Secret storage backend (forwarded to `api.secrets` when granted). */
  secretsBackend?: SecretsBackend;
  /**
   * Dynamic artifact-schema registry. When provided, the loader gathers every
   * active plugin's `contributions.artifactSchemas` and pushes them as plugin
   * records once the activation pass completes. Same registry is used by
   * `parseArtifact` to resolve `plugin:<id>:<type>@<version>` kinds.
   */
  artifactSchemas?: ArtifactSchemaRegistry;
  /** Parser registry — same lifecycle as `artifactSchemas`. */
  parsers?: ParserRegistry;
  /** Step-kind suggestion registry — same lifecycle as `artifactSchemas`. */
  stepKindSuggestions?: StepKindSuggestionRegistry;
  /** Console-style sink for loader-level messages (one prefix per plugin). */
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
};

type SourceDir = {
  dir: string;
  source: "builtin" | "user";
};

const defaultLogger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
};

const pluginRequire = createRequire(__filename);

/**
 * Casts a `manifest.contributions.artifactSchemas` entry (typed `unknown` by the
 * manifest schema) into the registry's contribution shape. Invalid entries are
 * logged and dropped so a malformed contribution can't crash the activation
 * pass — the rest of the plugin still loads.
 */
const buildArtifactSchemaContributions = (
  manifest: PluginManifest,
  log: NonNullable<LoaderDeps["logger"]>,
): PluginArtifactSchemaContribution["types"] => {
  const raw = manifest.contributions?.artifactSchemas;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: PluginArtifactSchemaContribution["types"][number][] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.version !== "string") {
      log.warn(
        `[plugin:${manifest.id}] artifactSchemas entry missing id/version — skipped`,
      );
      continue;
    }
    if (typeof e.name !== "string") {
      log.warn(
        `[plugin:${manifest.id}] artifactSchemas entry "${e.id}" missing name — skipped`,
      );
      continue;
    }
    if (e.simplifiedSchema === undefined || e.simplifiedSchema === null) {
      log.warn(
        `[plugin:${manifest.id}] artifactSchemas entry "${e.id}" missing simplifiedSchema — skipped`,
      );
      continue;
    }
    out.push({
      id: e.id,
      version: e.version,
      name: e.name,
      description: typeof e.description === "string" ? e.description : undefined,
      rawSchema: e.rawSchema === undefined ? null : e.rawSchema,
      simplifiedSchema: e.simplifiedSchema,
      sampleRaw: typeof e.sampleRaw === "string" ? e.sampleRaw : null,
      markdownTemplate:
        typeof e.markdownTemplate === "string" ? e.markdownTemplate : undefined,
    });
  }
  return out;
};

/**
 * Walks `manifest.contributions.stepKinds[].suggestedFor` to derive the
 * suggestions this plugin exposes. Entries without a `suggestedFor` clause
 * are documentation-only (they describe what `api.registerStepRunner` will
 * register) and don't contribute here.
 */
const buildStepKindSuggestionContributions = (
  manifest: PluginManifest,
  log: NonNullable<LoaderDeps["logger"]>,
): PluginStepKindSuggestionContribution["suggestions"] => {
  const raw = manifest.contributions?.stepKinds;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: PluginStepKindSuggestionContribution["suggestions"][number][] = [];
  for (const entry of raw) {
    const sf = entry.suggestedFor;
    if (!sf) continue;
    if (typeof sf.inputKind !== "string" || sf.inputKind.length === 0) {
      log.warn(
        `[plugin:${manifest.id}] stepKinds entry "${entry.id}" suggestedFor.inputKind invalid — skipped`,
      );
      continue;
    }
    out.push({
      stepKindId: entry.id,
      label: entry.label,
      icon: entry.icon,
      inputKind: sf.inputKind as ArtifactKind,
      role: sf.role,
    });
  }
  return out;
};

const buildParserContributions = (
  manifest: PluginManifest,
  log: NonNullable<LoaderDeps["logger"]>,
): PluginParserContribution["parsers"] => {
  const raw = manifest.contributions?.parsers;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: PluginParserContribution["parsers"][number][] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.version !== "string") {
      log.warn(
        `[plugin:${manifest.id}] parsers entry missing id/version — skipped`,
      );
      continue;
    }
    if (!e.forType || typeof e.forType !== "object") {
      log.warn(
        `[plugin:${manifest.id}] parsers entry "${e.id}" missing forType — skipped`,
      );
      continue;
    }
    const ft = e.forType as Record<string, unknown>;
    if (typeof ft.id !== "string" || typeof ft.version !== "string") {
      log.warn(
        `[plugin:${manifest.id}] parsers entry "${e.id}" forType.id/version invalid — skipped`,
      );
      continue;
    }
    if (e.mode !== "declarative" && e.mode !== "code") {
      log.warn(
        `[plugin:${manifest.id}] parsers entry "${e.id}" mode must be "declarative" or "code" — skipped`,
      );
      continue;
    }
    out.push({
      id: e.id,
      version: e.version,
      forType: { id: ft.id, version: ft.version } satisfies ArtifactSchemaRef,
      mode: e.mode,
      body: e.body,
      meta:
        e.meta && typeof e.meta === "object"
          ? (e.meta as Record<string, unknown>)
          : undefined,
    });
  }
  return out;
};

/**
 * Rebuilds the full set of plugin-contributed artifact types & parsers from
 * the registry's active entries and pushes them to the respective registries.
 * Called after every activation/deactivation pass so the registries always
 * reflect what is currently live.
 */
export const applyPluginContributions = (
  registry: PluginRegistry,
  deps: {
    artifactSchemas?: ArtifactSchemaRegistry;
    parsers?: ParserRegistry;
    stepKindSuggestions?: StepKindSuggestionRegistry;
    logger: NonNullable<LoaderDeps["logger"]>;
  },
): void => {
  const active = registry.list().filter((p) => p.state === "active");
  if (deps.artifactSchemas) {
    const types: PluginArtifactSchemaContribution[] = active
      .map((p) => ({
        pluginId: p.manifest.id,
        types: buildArtifactSchemaContributions(p.manifest, deps.logger),
      }))
      .filter((c) => c.types.length > 0);
    deps.artifactSchemas.setPluginContributions(types);
  }
  if (deps.parsers) {
    const parsers: PluginParserContribution[] = active
      .map((p) => ({
        pluginId: p.manifest.id,
        parsers: buildParserContributions(p.manifest, deps.logger),
      }))
      .filter((c) => c.parsers.length > 0);
    deps.parsers.setPluginContributions(parsers);
  }
  if (deps.stepKindSuggestions) {
    const suggestions: PluginStepKindSuggestionContribution[] = active
      .map((p) => ({
        pluginId: p.manifest.id,
        suggestions: buildStepKindSuggestionContributions(
          p.manifest,
          deps.logger,
        ),
      }))
      .filter((c) => c.suggestions.length > 0);
    deps.stepKindSuggestions.setPluginContributions(suggestions);
  }
};

const compareSemver = (a: string, b: string): number => {
  const split = (v: string): number[] =>
    v
      .split(/[-+]/, 1)[0]
      .split(".")
      .map((p) => Number.parseInt(p, 10) || 0);
  const [a1, a2, a3] = split(a);
  const [b1, b2, b3] = split(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
};

const readManifest = (rootDir: string): PluginManifest | null => {
  const file = path.join(rootDir, "manifest.json");
  let raw: unknown;
  try {
    const text = fs.readFileSync(file, "utf8");
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `cannot read manifest at ${file}: ${(err as Error).message}`,
    );
  }
  const result = PluginManifestSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new Error(`invalid manifest at ${file}: ${issues}`);
  }
  return result.data;
};

const ensureUnderRoot = (rootDir: string, candidate: string): string => {
  const abs = path.resolve(rootDir, candidate);
  const rootAbs = path.resolve(rootDir);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new Error(
      `plugin path ${candidate} escapes its plugin root (${rootDir})`,
    );
  }
  return abs;
};

/**
 * Returns the authorization status for a discovered plugin without touching
 * its code. Built-ins are auto-approved. User plugins look up the grant
 * store; the grant must (a) exist, (b) be enabled, and (c) cover every
 * permission the new manifest version requests — otherwise we go pending.
 */
const resolveActivation = (
  manifest: PluginManifest,
  source: "builtin" | "user",
  grants: GrantStore | null,
): { grant: Grant; pending: false } | { grant: null; pending: true } => {
  const declared = (manifest.permissions ?? []);
  if (source === "builtin" || !grants) {
    return {
      grant: makeBuiltinGrant(manifest.id, manifest.version, declared),
      pending: false,
    };
  }
  const existing = grants.get(manifest.id, manifest.version);
  if (!existing) {
    return { grant: null, pending: true };
  }
  // If the manifest requests a permission that is not in the existing grant,
  // we want to re-prompt — otherwise an attacker who can edit the manifest
  // could silently widen the capability set. Disabled is fine: we still
  // "load" with permissions=∅ so the Settings UI can show it; the grant
  // factory then refuses every gated call.
  const missing = declared.filter((p) => !existing.permissions.has(p));
  if (missing.length > 0) {
    return { grant: null, pending: true };
  }
  return { grant: existing, pending: false };
};

/**
 * Discovered (but not yet activated) plugin. Stored on the registry as a
 * `LoadedPlugin` with `state: "pending"` so the Settings UI can list it.
 */
export type DiscoveredPlugin = {
  manifest: PluginManifest;
  source: "builtin" | "user";
  rootDir: string;
};

const scanPluginDir = (
  rootDir: string,
  source: "builtin" | "user",
  appVersion: string,
  log: NonNullable<LoaderDeps["logger"]>,
): DiscoveredPlugin | null => {
  let manifest: PluginManifest;
  try {
    const parsed = readManifest(rootDir);
    if (!parsed) return null;
    manifest = parsed;
  } catch (err) {
    log.error(`[plugins] skip ${rootDir}: ${(err as Error).message}`);
    return null;
  }
  if (
    manifest.minAppVersion &&
    compareSemver(appVersion, manifest.minAppVersion) < 0
  ) {
    log.warn(
      `[plugin:${manifest.id}] skip: requires app >= ${manifest.minAppVersion}, have ${appVersion}`,
    );
    return null;
  }
  // Warn about permissions accepted by the catalog but lacking an API impl.
  for (const p of manifest.permissions ?? []) {
    if (!IMPLEMENTED_PERMISSIONS.has(p)) {
      log.warn(
        `[plugin:${manifest.id}] permission "${p}" is declared but its API is not yet implemented — the manifest is still accepted`,
      );
    }
  }
  return { manifest, source, rootDir };
};

const listPluginDirs = (parent: string): string[] => {
  if (!fs.existsSync(parent)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(parent, e.name))
    .filter((dir) => fs.existsSync(path.join(dir, "manifest.json")));
};

export const scanPlugins = (
  sources: ReadonlyArray<SourceDir>,
  deps: Pick<LoaderDeps, "appVersion" | "logger">,
): ReadonlyArray<DiscoveredPlugin> => {
  const log = deps.logger ?? defaultLogger;
  const discovered: DiscoveredPlugin[] = [];
  for (const { dir, source } of sources) {
    for (const pluginDir of listPluginDirs(dir)) {
      const d = scanPluginDir(pluginDir, source, deps.appVersion, log);
      if (d) discovered.push(d);
    }
  }
  return discovered;
};

/**
 * Activates one discovered plugin: requires its `main.js` (if any) and runs
 * `onload(api)` with a permission-filtered API. Throws on `onload` failure so
 * the caller can decide how to surface the error.
 */
export const activatePlugin = async (
  discovered: DiscoveredPlugin,
  grant: Grant,
  deps: LoaderDeps,
): Promise<LoadedPlugin> => {
  const log = deps.logger ?? defaultLogger;
  const { manifest, source, rootDir } = discovered;
  const registeredKinds = new Set<StepKindId>();
  const ipcHandlers = new Map<string, PluginIpcHandler>();
  const dataDir = deps.pluginDataDirFor(manifest.id);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    log.warn(
      `[plugin:${manifest.id}] could not create data dir ${dataDir}: ${(err as Error).message}`,
    );
  }

  // Live grant resolver. For built-ins, fall back to the synthesised grant
  // when no DB override exists. For user plugins, the DB row is the source
  // of truth — losing the row mid-session disarms the API.
  const getGrant = (): Grant | null => {
    if (deps.grants) {
      const dbGrant = deps.grants.get(manifest.id, manifest.version);
      if (dbGrant) return dbGrant;
    }
    return source === "builtin" ? grant : null;
  };

  const apiDeps: BuildApiDeps = {
    manifest,
    pluginDataDir: dataDir,
    runners: deps.runners,
    registeredKinds,
    ipcHandlers,
    getGrant,
  };
  if (deps.engineRead) apiDeps.engine = deps.engineRead;
  if (deps.secretsBackend) apiDeps.secrets = deps.secretsBackend;
  const api = buildPluginApi(apiDeps);

  let mainModule: PluginMainModule | null = null;
  if (manifest.main) {
    let entryAbs: string;
    try {
      entryAbs = ensureUnderRoot(rootDir, manifest.main);
    } catch (err) {
      throw new Error(`${(err as Error).message}`);
    }
    try {
      mainModule = pluginRequire(entryAbs) as PluginMainModule;
    } catch (err) {
      throw new Error(`failed to require main: ${(err as Error).message}`);
    }
    try {
      await mainModule.onload?.(api);
    } catch (err) {
      throw new Error(
        `onload threw: ${(err as Error).stack ?? (err as Error).message}`,
      );
    }
  }

  const loaded: LoadedPlugin = {
    manifest,
    source,
    rootDir,
    api,
    module: mainModule,
    registeredStepKinds: registeredKinds,
    ipcHandlers,
    state: "active",
    grant,
  };
  deps.registry.add(loaded);
  log.info(
    `[plugin:${manifest.id}] loaded (${source}, v${manifest.version}, kinds=${registeredKinds.size}, ipc=${ipcHandlers.size})`,
  );
  return loaded;
};

/**
 * Records a discovered plugin as "pending authorization" without running its
 * code. The Settings UI surfaces these so the user can grant or deny.
 */
export const recordPending = (
  discovered: DiscoveredPlugin,
  registry: PluginRegistry,
): LoadedPlugin => {
  const placeholder: LoadedPlugin = {
    manifest: discovered.manifest,
    source: discovered.source,
    rootDir: discovered.rootDir,
    api: null,
    module: null,
    registeredStepKinds: new Set(),
    ipcHandlers: new Map(),
    state: "pending",
    grant: null,
  };
  registry.add(placeholder);
  return placeholder;
};

export const loadPlugins = async (
  sources: ReadonlyArray<SourceDir>,
  deps: LoaderDeps,
): Promise<ReadonlyArray<LoadedPlugin>> => {
  const log = deps.logger ?? defaultLogger;
  const discovered = scanPlugins(sources, deps);
  const loaded: LoadedPlugin[] = [];
  // Re-applied after every activation/deactivation: registries always
  // mirror the live set of active plugins.
  const refresh = () =>
    applyPluginContributions(deps.registry, {
      artifactSchemas: deps.artifactSchemas,
      parsers: deps.parsers,
      stepKindSuggestions: deps.stepKindSuggestions,
      logger: log,
    });
  for (const d of discovered) {
    const activation = resolveActivation(d.manifest, d.source, deps.grants);
    if (activation.pending) {
      log.info(
        `[plugin:${d.manifest.id}] pending authorization (v${d.manifest.version})`,
      );
      loaded.push(recordPending(d, deps.registry));
      continue;
    }
    if (!activation.grant.enabled) {
      log.info(
        `[plugin:${d.manifest.id}] disabled by user — recording as inactive`,
      );
      const inactive: LoadedPlugin = {
        manifest: d.manifest,
        source: d.source,
        rootDir: d.rootDir,
        api: null,
        module: null,
        registeredStepKinds: new Set(),
        ipcHandlers: new Map(),
        state: "disabled",
        grant: activation.grant,
      };
      deps.registry.add(inactive);
      loaded.push(inactive);
      continue;
    }
    try {
      loaded.push(await activatePlugin(d, activation.grant, deps));
    } catch (err) {
      log.error(`[plugin:${d.manifest.id}] ${(err as Error).message}`);
      const failed: LoadedPlugin = {
        manifest: d.manifest,
        source: d.source,
        rootDir: d.rootDir,
        api: null,
        module: null,
        registeredStepKinds: new Set(),
        ipcHandlers: new Map(),
        state: "failed",
        grant: activation.grant,
        error: (err as Error).message,
      };
      deps.registry.add(failed);
      loaded.push(failed);
    }
  }
  refresh();
  return loaded;
};

export const unloadAllPlugins = async (
  registry: PluginRegistry,
  logger?: LoaderDeps["logger"],
): Promise<void> => {
  const log = logger ?? defaultLogger;
  for (const plugin of [...registry.list()]) {
    if (plugin.module && plugin.api) {
      try {
        await plugin.module.onunload?.(plugin.api);
      } catch (err) {
        log.error(
          `[plugin:${plugin.manifest.id}] onunload threw: ${(err as Error).message}`,
        );
      }
    }
    registry.remove(plugin.manifest.id);
  }
};

/**
 * Unloads a single active plugin: invokes its `onunload`, unregisters its
 * step kinds, and clears its IPC handlers. The placeholder stays in the
 * registry so the Settings UI can still display it (state flips to
 * "disabled" or "pending" depending on the caller).
 */
export const deactivatePlugin = async (
  plugin: LoadedPlugin,
  runners: StepRunnerRegistry,
  logger?: LoaderDeps["logger"],
): Promise<void> => {
  const log = logger ?? defaultLogger;
  if (plugin.module && plugin.api) {
    try {
      await plugin.module.onunload?.(plugin.api);
    } catch (err) {
      log.error(
        `[plugin:${plugin.manifest.id}] onunload threw: ${(err as Error).message}`,
      );
    }
  }
  for (const kind of plugin.registeredStepKinds) {
    (runners as StepRunnerRegistry & {
      unregister?: (kind: StepKindId) => void;
    }).unregister?.(kind);
  }
  plugin.registeredStepKinds.clear();
  plugin.ipcHandlers.clear();
};

export type { SourceDir };

// Backwards-compat re-export so older imports keep working without churn.
export type LoaderHandle = {
  loadPlugins: typeof loadPlugins;
  unloadAllPlugins: typeof unloadAllPlugins;
};

/**
 * Re-runs scan + grant resolution for one plugin id. Returns the new entry
 * (or `null` if the plugin can no longer be found on disk). Used after the
 * user grants permissions from the Settings UI to flip a `pending` row into
 * an `active` one without restarting the app.
 */
export const reactivateOne = async (
  pluginId: string,
  sources: ReadonlyArray<SourceDir>,
  deps: LoaderDeps,
): Promise<LoadedPlugin | null> => {
  const log = deps.logger ?? defaultLogger;
  const refresh = () =>
    applyPluginContributions(deps.registry, {
      artifactSchemas: deps.artifactSchemas,
      parsers: deps.parsers,
      stepKindSuggestions: deps.stepKindSuggestions,
      logger: log,
    });
  const existing = deps.registry.get(pluginId);
  if (existing && existing.state === "active") {
    await deactivatePlugin(existing, deps.runners, deps.logger);
    deps.registry.remove(pluginId);
  } else if (existing) {
    deps.registry.remove(pluginId);
  }
  const discovered = scanPlugins(sources, deps).find(
    (d) => d.manifest.id === pluginId,
  );
  if (!discovered) {
    refresh();
    return null;
  }
  const activation = resolveActivation(
    discovered.manifest,
    discovered.source,
    deps.grants,
  );
  if (activation.pending) {
    const pending = recordPending(discovered, deps.registry);
    refresh();
    return pending;
  }
  if (!activation.grant.enabled) {
    const inactive: LoadedPlugin = {
      manifest: discovered.manifest,
      source: discovered.source,
      rootDir: discovered.rootDir,
      api: null,
      module: null,
      registeredStepKinds: new Set(),
      ipcHandlers: new Map(),
      state: "disabled",
      grant: activation.grant,
    };
    deps.registry.add(inactive);
    refresh();
    return inactive;
  }
  try {
    const next = await activatePlugin(discovered, activation.grant, deps);
    refresh();
    return next;
  } catch (err) {
    const failed: LoadedPlugin = {
      manifest: discovered.manifest,
      source: discovered.source,
      rootDir: discovered.rootDir,
      api: null,
      module: null,
      registeredStepKinds: new Set(),
      ipcHandlers: new Map(),
      state: "failed",
      grant: activation.grant,
      error: (err as Error).message,
    };
    deps.registry.add(failed);
    refresh();
    return failed;
  }
};
