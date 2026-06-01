/**
 * Builds the `PluginApi` object exposed to a plugin's `main.js`, filtered by
 * the grant set the user has accepted for this `(pluginId, version)`.
 *
 * Design:
 *  - **Hot revocation.** Every gated method consults `getGrant()` at call time,
 *    not at construction. Revoking a permission from Settings takes effect
 *    immediately for the *next* call without an app restart. The plugin's
 *    `onload` is not re-run — already-issued capabilities (a step runner that
 *    was registered, a setTimeout already armed) keep running, but their gated
 *    side-effects start throwing.
 *  - **No silent failure.** A gated method called without the required grant
 *    throws a `PluginPermissionError` with the permission id in the message so
 *    plugin authors get a clear signal during development.
 *  - **Confinement at the lowest level.** `fs:*` is rooted at `pluginDataDir`
 *    — there is no path validation at every call, `path.resolve` + a prefix
 *    check is enforced once per call. `network` consults `manifest.networkHosts`
 *    on every fetch so an attacker can't widen the host set at runtime.
 */
import { net as electronNet, safeStorage, Notification } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  PluginApi,
  PluginEngineApi,
  PluginFsApi,
  PluginIpcHandler,
  PluginNetApi,
  PluginNotificationsApi,
  PluginSecretsApi,
} from "./api";
import type { Grant } from "./grants";
import type { PermissionId } from "./permissions-catalog";
import type { PluginManifest } from "./manifest";
import type { StepRunner, StepRunnerRegistry } from "../wf/application/step-runner";
import type { StepKindId } from "../wf/domain/template";

export class PluginPermissionError extends Error {
  constructor(public readonly pluginId: string, public readonly permission: PermissionId) {
    super(
      `[plugin:${pluginId}] permission "${permission}" was not granted (revoked or never approved)`,
    );
    this.name = "PluginPermissionError";
  }
}

const MethodSlugRe = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * Minimal read-only engine surface offered to plugins via `api.engine.*`.
 * The shape is intentionally small — anything richer should go through an
 * explicit IPC method in user code, where we can review the impact.
 */
export type PluginEngineReadDeps = {
  listInstances: () => Promise<unknown>;
  getTimeline: (instanceId: string) => Promise<unknown>;
  getArtifact: (artifactId: string) => Promise<{ meta: unknown; content: string }>;
  listTemplates: () => Promise<unknown>;
  listSkills: () => Promise<unknown>;
};

export type SecretsBackend = {
  /**
   * Returns the chiffré buffer for the given (pluginId, key). `null` when none
   * is stored. Backend pre-scopes by pluginId so plugins never see other
   * plugins' keys, even by guess.
   */
  read(pluginId: string, key: string): Buffer | null;
  write(pluginId: string, key: string, value: Buffer): void;
  remove(pluginId: string, key: string): void;
};

export type BuildApiDeps = {
  manifest: PluginManifest;
  pluginDataDir: string;
  runners: StepRunnerRegistry;
  registeredKinds: Set<StepKindId>;
  ipcHandlers: Map<string, PluginIpcHandler>;
  /**
   * Resolves the *current* grant on demand. The factory captures this function,
   * not the grant itself, so revocations are picked up live.
   */
  getGrant: () => Grant | null;
  engine?: PluginEngineReadDeps;
  secrets?: SecretsBackend;
  /**
   * Optional rate-limit for `api.notifications.notify`. Defaults to 5/min.
   */
  notificationRatePerMin?: number;
};

const SLUG_KEY_RE = /^[a-zA-Z0-9._-]{1,128}$/;

const ensureGranted = (
  pluginId: string,
  permission: PermissionId,
  getGrant: () => Grant | null,
): void => {
  const g = getGrant();
  if (!g || !g.enabled || !g.permissions.has(permission)) {
    throw new PluginPermissionError(pluginId, permission);
  }
};

const resolveUnderRoot = (root: string, rel: string): string => {
  const abs = path.resolve(root, rel);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new Error(
      `path "${rel}" escapes the plugin data directory; access denied`,
    );
  }
  return abs;
};

const buildFsApi = (
  pluginId: string,
  pluginDataDir: string,
  getGrant: () => Grant | null,
): PluginFsApi => {
  const requireRead = () => ensureGranted(pluginId, "fs:read", getGrant);
  const requireWrite = () => ensureGranted(pluginId, "fs:write", getGrant);
  return {
    async readFile(rel) {
      requireRead();
      const abs = resolveUnderRoot(pluginDataDir, rel);
      return fs.readFile(abs, "utf8");
    },
    async readBytes(rel) {
      requireRead();
      const abs = resolveUnderRoot(pluginDataDir, rel);
      const buf = await fs.readFile(abs);
      return new Uint8Array(buf);
    },
    async readdir(rel) {
      requireRead();
      const abs = resolveUnderRoot(pluginDataDir, rel || ".");
      return fs.readdir(abs);
    },
    async stat(rel) {
      requireRead();
      const abs = resolveUnderRoot(pluginDataDir, rel);
      const s = await fs.stat(abs);
      return {
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        size: s.size,
        modifiedAt: s.mtime.toISOString(),
      };
    },
    async writeFile(rel, content) {
      requireWrite();
      const abs = resolveUnderRoot(pluginDataDir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf8");
    },
    async writeBytes(rel, content) {
      requireWrite();
      const abs = resolveUnderRoot(pluginDataDir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
    },
    async mkdir(rel) {
      requireWrite();
      const abs = resolveUnderRoot(pluginDataDir, rel);
      await fs.mkdir(abs, { recursive: true });
    },
    async remove(rel) {
      requireWrite();
      const abs = resolveUnderRoot(pluginDataDir, rel);
      await fs.rm(abs, { recursive: true, force: true });
    },
  };
};

const buildNetApi = (
  pluginId: string,
  manifest: PluginManifest,
  getGrant: () => Grant | null,
): PluginNetApi => {
  const allow = new Set(
    (manifest.networkHosts ?? []).map((h) => h.toLowerCase()),
  );
  return {
    async fetch(input, init) {
      ensureGranted(pluginId, "network", getGrant);
      const urlString = typeof input === "string" ? input : input.url;
      let parsed: URL;
      try {
        parsed = new URL(urlString);
      } catch {
        throw new Error(
          `[plugin:${pluginId}] net.fetch: invalid URL "${urlString}"`,
        );
      }
      const host = parsed.hostname.toLowerCase();
      if (!allow.has(host)) {
        throw new Error(
          `[plugin:${pluginId}] net.fetch: host "${host}" not in allow-list (${[...allow].join(", ") || "<empty>"})`,
        );
      }
      // Use Electron's net module — it integrates with the user's proxy config
      // and the certificate trust the rest of the app sees. Falls back to
      // global `fetch` if for some reason `electronNet.fetch` is unavailable.
      const fetcher = electronNet?.fetch ?? globalThis.fetch;
      return fetcher(urlString, init);
    },
  };
};

const buildSecretsApi = (
  pluginId: string,
  backend: SecretsBackend,
  getGrant: () => Grant | null,
): PluginSecretsApi => ({
  async get(key) {
    ensureGranted(pluginId, "secrets", getGrant);
    if (!SLUG_KEY_RE.test(key)) {
      throw new Error(
        `[plugin:${pluginId}] secrets.get: key must match ${SLUG_KEY_RE.source}`,
      );
    }
    const buf = backend.read(pluginId, key);
    if (!buf) return null;
    if (!safeStorage.isEncryptionAvailable()) return buf.toString("utf8");
    try {
      return safeStorage.decryptString(buf);
    } catch (err) {
      throw new Error(
        `[plugin:${pluginId}] secrets.get: failed to decrypt "${key}" — ${(err as Error).message}`,
      );
    }
  },
  async set(key, value) {
    ensureGranted(pluginId, "secrets", getGrant);
    if (!SLUG_KEY_RE.test(key)) {
      throw new Error(
        `[plugin:${pluginId}] secrets.set: key must match ${SLUG_KEY_RE.source}`,
      );
    }
    const buf = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value)
      : Buffer.from(value, "utf8");
    backend.write(pluginId, key, buf);
  },
  async delete(key) {
    ensureGranted(pluginId, "secrets", getGrant);
    if (!SLUG_KEY_RE.test(key)) {
      throw new Error(
        `[plugin:${pluginId}] secrets.delete: key must match ${SLUG_KEY_RE.source}`,
      );
    }
    backend.remove(pluginId, key);
  },
});

const buildEngineApi = (
  pluginId: string,
  deps: PluginEngineReadDeps,
  getGrant: () => Grant | null,
): PluginEngineApi => ({
  async listInstances() {
    ensureGranted(pluginId, "engine:read", getGrant);
    return deps.listInstances();
  },
  async getTimeline(instanceId) {
    ensureGranted(pluginId, "engine:read", getGrant);
    return deps.getTimeline(instanceId);
  },
  async getArtifact(artifactId) {
    ensureGranted(pluginId, "engine:read", getGrant);
    return deps.getArtifact(artifactId);
  },
  async listTemplates() {
    ensureGranted(pluginId, "engine:read", getGrant);
    return deps.listTemplates();
  },
  async listSkills() {
    ensureGranted(pluginId, "engine:read", getGrant);
    return deps.listSkills();
  },
});

const buildNotificationsApi = (
  pluginId: string,
  getGrant: () => Grant | null,
  ratePerMin: number,
): PluginNotificationsApi => {
  const recent: number[] = [];
  return {
    async notify(args) {
      ensureGranted(pluginId, "notifications", getGrant);
      const now = Date.now();
      // Drop entries older than one minute, then enforce the rate.
      while (recent.length > 0 && now - recent[0] > 60_000) recent.shift();
      if (recent.length >= ratePerMin) {
        throw new Error(
          `[plugin:${pluginId}] notifications rate exceeded (${ratePerMin}/min)`,
        );
      }
      if (!Notification.isSupported()) return;
      const n = new Notification({
        title: String(args.title ?? "Plugin"),
        body: args.body ? String(args.body) : undefined,
        silent: args.silent === true,
      });
      n.show();
      recent.push(now);
    },
  };
};

/**
 * Constructs the PluginApi exposed to a plugin's `onload`. Capabilities
 * outside `permissions-catalog.IMPLEMENTED_PERMISSIONS` are omitted entirely;
 * within that set, presence on `api.*` depends on the manifest declaring the
 * permission *and* the grant being live at call time.
 */
export const buildPluginApi = (deps: BuildApiDeps): PluginApi => {
  const {
    manifest,
    pluginDataDir,
    runners,
    registeredKinds,
    ipcHandlers,
    getGrant,
    engine,
    secrets,
    notificationRatePerMin = 5,
  } = deps;
  const declared = new Set<PermissionId>(manifest.permissions ?? []);
  const prefix = `[plugin:${manifest.id}]`;

  const api: PluginApi = {
    pluginId: manifest.id,
    pluginDataDir,
    log: {
      info: (...args) => console.log(prefix, ...args),
      warn: (...args) => console.warn(prefix, ...args),
      error: (...args) => console.error(prefix, ...args),
    },
    registerStepRunner: (runner: StepRunner) => {
      // `engine:steps` is the only permission gated at *registration* time —
      // unlike read/fetch/secret APIs, a step runner is registered once at
      // boot. Revoking `engine:steps` later won't unregister the runner; the
      // user has to disable the plugin entirely for that.
      ensureGranted(manifest.id, "engine:steps", getGrant);
      runners.register(runner);
      registeredKinds.add(runner.kind);
    },
    registerIpcHandler: (method: string, fn: PluginIpcHandler) => {
      if (!MethodSlugRe.test(method)) {
        throw new Error(
          `${prefix} invalid IPC method name "${method}" (slug ^[a-z0-9][a-z0-9._-]*$ required)`,
        );
      }
      if (ipcHandlers.has(method)) {
        throw new Error(`${prefix} IPC method already registered: ${method}`);
      }
      ipcHandlers.set(method, fn);
    },
  };

  if (declared.has("fs:read") || declared.has("fs:write")) {
    api.fs = buildFsApi(manifest.id, pluginDataDir, getGrant);
  }
  if (declared.has("network")) {
    api.net = buildNetApi(manifest.id, manifest, getGrant);
  }
  if (declared.has("secrets") && secrets) {
    api.secrets = buildSecretsApi(manifest.id, secrets, getGrant);
  }
  if (declared.has("engine:read") && engine) {
    api.engine = buildEngineApi(manifest.id, engine, getGrant);
  }
  if (declared.has("notifications")) {
    api.notifications = buildNotificationsApi(
      manifest.id,
      getGrant,
      notificationRatePerMin,
    );
  }

  return api;
};
