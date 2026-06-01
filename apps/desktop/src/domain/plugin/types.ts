/**
 * Domain types describing the renderer-side view of a plugin.
 *
 * These are JSON-serialisable mirrors of the snapshots produced by the main
 * process (cf. `electron/main/ipc/plugins.ts`). They live in `domain/` so the
 * renderer can depend on them without touching the IPC surface — the
 * `PluginGateway` port (see `application/ports/plugin-gateway.ts`) is the only
 * boundary that translates between `window.api.plugins.*` and these types.
 */

export type PluginSource = "builtin" | "user";

export type PluginState = "active" | "pending" | "disabled" | "failed";

export type PluginStepKindContribution = {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
};

export type PluginListEntry = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly author?: string;
  readonly homepage?: string;
  readonly source: PluginSource;
  readonly state: PluginState;
  /**
   * Core plugin — load-bearing built-in. The renderer disables the enable/
   * disable toggle when this is `true`; the IPC handler also rejects attempts
   * to flip it off.
   */
  readonly core: boolean;
  readonly declaredPermissions: ReadonlyArray<string>;
  readonly grantedPermissions: ReadonlyArray<string>;
  readonly networkHosts: ReadonlyArray<string>;
  /** Relative path to the renderer entry, or `null` if the plugin has none. */
  readonly renderer: string | null;
  readonly methods: ReadonlyArray<string>;
  readonly contributions: {
    readonly stepKinds: ReadonlyArray<PluginStepKindContribution>;
  };
  readonly error?: string;
};

export type PluginPermissionMeta = {
  readonly id: string;
  readonly label: string;
  readonly rationale: string;
  readonly sensitive: boolean;
};

export type PluginGrantInput = {
  readonly pluginId: string;
  readonly version: string;
  readonly permissions: ReadonlyArray<string>;
  readonly enabled?: boolean;
};

export type PluginSetPermissionInput = {
  readonly pluginId: string;
  readonly permission: string;
  readonly granted: boolean;
};

export type PluginSetEnabledInput = {
  readonly pluginId: string;
  readonly enabled: boolean;
};
