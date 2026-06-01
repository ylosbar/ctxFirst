/**
 * Type-only contract for the **main-process half** of an CtxFirst plugin.
 *
 * Mirror of `apps/desktop/electron/main/plugins/api.ts`. Plugin authors import
 * these types as `devDependencies`; the runtime values are provided by the
 * host at `onload(api)` time. Nothing in this file ever ships to runtime — at
 * build time `tsc` emits empty `.js` shims so the package is consumable from
 * a plain `require`/`import` if needed.
 *
 * **Versioning.** The shape mirrored here matches the host's manifest schema
 * v1; any breaking change ships as a new SDK major.
 */

/** Permission identifiers — must match `permissions-catalog.ts` in the host. */
export type PermissionId =
  | "fs:read"
  | "fs:write"
  | "secrets"
  | "engine:read"
  | "engine:steps"
  | "engine:llm"
  | "network"
  | "notifications"
  | "protocol"
  | "http-server"
  | "db:read"
  | "db:write";

/**
 * Declarative metadata loaded before the plugin's code runs. The host
 * validates this at startup with a zod schema; any deviation rejects the
 * plugin with a precise error.
 */
export type PluginManifest = {
  /** Slug, lowercase, dot- and dash-friendly. Stable across versions. */
  id: string;
  name: string;
  /** Semver. Bumping this re-prompts for authorization. */
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  /** Minimum app version (semver), checked at load time. */
  minAppVersion?: string;
  /** Relative path to the main-process CJS entry. */
  main?: string;
  /** Relative path to the renderer ESM entry. */
  renderer?: string;
  permissions?: PermissionId[];
  /** Mandatory when `permissions` includes `"network"`. Hostname-only. */
  networkHosts?: string[];
  contributions?: {
    stepKinds?: Array<{
      id: string;
      label: string;
      icon?: string;
      /**
       * Optional hint surfaced by the template editor: when the user wires an
       * input of `suggestedFor.inputKind` into a downstream step, the editor
       * proposes this kind as a code-action ("the plugin suggests …"). The
       * `role` is a free-form tag the UI can group/sort by (e.g.
       * `"context-simplifier"`, `"extractor"`, `"formatter"`). No automatic
       * insertion — the user always opts in.
       */
      suggestedFor?: {
        inputKind: string;
        role?: string;
      };
    }>;
    routes?: unknown[];
    navItems?: unknown[];
    artifactSchemas?: unknown[];
    parsers?: unknown[];
  };
};

export type PluginLog = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type PluginIpcHandler = (args: unknown) => unknown | Promise<unknown>;

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

export type PluginNetApi = {
  fetch(input: string | { url: string }, init?: RequestInit): Promise<Response>;
};

export type PluginSecretsApi = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type PluginEngineApi = {
  listInstances(): Promise<unknown>;
  getTimeline(instanceId: string): Promise<unknown>;
  getArtifact(artifactId: string): Promise<{ meta: unknown; content: string }>;
  listTemplates(): Promise<unknown>;
  listSkills(): Promise<unknown>;
};

export type PluginNotificationsApi = {
  notify(args: {
    title: string;
    body?: string;
    silent?: boolean;
  }): Promise<void>;
};

/**
 * Runner the plugin registers via `api.registerStepRunner`. The shape mirrors
 * the host's internal `StepRunner` contract. Plugin authors are advised to
 * structure their runners as small modules and avoid importing into them from
 * the host's internals.
 */
export type PluginStepRunner<Config = Record<string, unknown>> = {
  readonly kind: string;
  resolveSpec(ctx: {
    config: Readonly<Config>;
    template?: { variables: ReadonlyArray<{ name: string; kind: string }> };
  }): {
    title: string;
    description?: string;
    inputs: Array<{
      name: string;
      kinds: string[];
      optional?: boolean;
      isList?: boolean;
      primary?: boolean;
    }>;
    outputs: Array<{
      name: string;
      kind: string;
      description?: string;
      primary?: boolean;
    }>;
    passthrough?: boolean;
  };
  run(ctx: unknown): Promise<unknown>;
};

export type PluginApi = {
  readonly pluginId: string;
  readonly pluginDataDir: string;
  readonly log: PluginLog;
  registerStepRunner(runner: PluginStepRunner): void;
  registerIpcHandler(method: string, fn: PluginIpcHandler): void;
  fs?: PluginFsApi;
  net?: PluginNetApi;
  secrets?: PluginSecretsApi;
  engine?: PluginEngineApi;
  notifications?: PluginNotificationsApi;
};

/**
 * Module shape expected from a plugin's `main.js`. At runtime, CommonJS
 * `module.exports.onload = ...` or ESM `export const onload = ...` both work.
 */
export type PluginMainModule = {
  onload?: (api: PluginApi) => void | Promise<void>;
  onunload?: (api: PluginApi) => void | Promise<void>;
};

/**
 * Compile-time helper for authors: `defineMain` is a no-op at runtime that
 * narrows the export shape. Use it to get autocomplete inside `onload`:
 *
 * ```ts
 * import { defineMain } from "@ctxfirst/plugin-sdk/main";
 * export default defineMain({
 *   async onload(api) { … },
 *   async onunload(api) { … },
 * });
 * ```
 */
export const defineMain = (mod: PluginMainModule): PluginMainModule => mod;
