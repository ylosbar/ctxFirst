/**
 * `PluginApi` — surface exposed to a plugin's `main.js` at `onload(api)` time.
 *
 * Phase 3: each namespace below is added to the object **only when the
 * corresponding permission is both declared in the manifest *and* granted by
 * the user.** Methods inside a namespace re-check the live grant at every
 * call so revocation from Settings takes effect immediately.
 *
 * `permissions-catalog.ts` is the catalogue of supported permissions. The
 * factory that filters this surface lives in `permissions.ts`.
 */
import type { StepRunner } from "../wf/application/step-runner";

export type PluginLog = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

/**
 * Method registered by a plugin via `api.registerIpcHandler`. Invoked through
 * the central `plugin:invoke` dispatcher; the renderer addresses it as
 * `{ pluginId, method }` so plugins cannot squat core IPC channels.
 */
export type PluginIpcHandler = (args: unknown) => unknown | Promise<unknown>;

/**
 * File-system surface confined to the plugin's private `pluginDataDir`.
 * Every operation resolves the given relative path against that root and
 * rejects any path that would escape it (no `..` exfiltration).
 */
export type PluginFsApi = {
  readFile(rel: string): Promise<string>;
  readBytes(rel: string): Promise<Uint8Array>;
  readdir(rel?: string): Promise<string[]>;
  stat(rel: string): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    modifiedAt: string;
  }>;
  writeFile(rel: string, content: string): Promise<void>;
  writeBytes(rel: string, content: Uint8Array): Promise<void>;
  mkdir(rel: string): Promise<void>;
  remove(rel: string): Promise<void>;
};

/**
 * Network surface — host-restricted `fetch`. The host of the URL passed in
 * must match one of the manifest's `networkHosts` entries (case-insensitive,
 * no wildcards). Otherwise the call rejects without contacting the network.
 */
export type PluginNetApi = {
  fetch(input: string | { url: string }, init?: RequestInit): Promise<Response>;
};

/**
 * Encrypted key/value store scoped to this plugin. Keys are slug-validated;
 * values are encrypted via `safeStorage` when supported by the OS keychain
 * (fallback: plaintext on disk, with a console warning at boot).
 */
export type PluginSecretsApi = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

/**
 * Read-only engine surface. Mirrors the renderer-side use-cases minus any
 * mutating operations — plugins explicitly cannot start/stop instances or
 * modify templates through this namespace.
 */
export type PluginEngineApi = {
  listInstances(): Promise<unknown>;
  getTimeline(instanceId: string): Promise<unknown>;
  getArtifact(artifactId: string): Promise<{ meta: unknown; content: string }>;
  listTemplates(): Promise<unknown>;
  listSkills(): Promise<unknown>;
};

/**
 * Rate-limited OS notifications. The limit is per-plugin (default 5/minute);
 * calls beyond the cap throw rather than silently drop, so plugin authors
 * notice and reshape their usage.
 */
export type PluginNotificationsApi = {
  notify(args: { title: string; body?: string; silent?: boolean }): Promise<void>;
};

export type PluginApi = {
  /** Stable plugin identifier from the manifest. */
  readonly pluginId: string;
  /** Per-plugin private data directory (`<userData>/plugins-data/<id>/`). */
  readonly pluginDataDir: string;
  /** Logger that prefixes every entry with `[plugin:<id>]`. */
  readonly log: PluginLog;
  /**
   * Register a step-kind runner. Gated by `engine:steps`. The runner is
   * removed from the engine registry when the plugin is unloaded.
   */
  registerStepRunner: (runner: StepRunner) => void;
  /**
   * Register an RPC method invokable by the renderer through the central
   * `plugin:invoke` dispatcher. `method` must be a non-empty slug; the same
   * `(pluginId, method)` pair cannot be registered twice. Not gated — the
   * dispatcher itself is harmless without other permissions.
   */
  registerIpcHandler: (method: string, fn: PluginIpcHandler) => void;
  /** Present iff the manifest declares (and the user granted) `fs:read` or `fs:write`. */
  fs?: PluginFsApi;
  /** Present iff the manifest declares (and the user granted) `network`. */
  net?: PluginNetApi;
  /** Present iff the manifest declares (and the user granted) `secrets`. */
  secrets?: PluginSecretsApi;
  /** Present iff the manifest declares (and the user granted) `engine:read`. */
  engine?: PluginEngineApi;
  /** Present iff the manifest declares (and the user granted) `notifications`. */
  notifications?: PluginNotificationsApi;
};

/**
 * Plugin-side lifecycle hooks. A built-in or external plugin's `main.js`
 * should export at least `onload`. `onunload` is optional but recommended
 * for any plugin that holds resources.
 */
export type PluginMainModule = {
  onload?: (api: PluginApi) => void | Promise<void>;
  onunload?: (api: PluginApi) => void | Promise<void>;
};
