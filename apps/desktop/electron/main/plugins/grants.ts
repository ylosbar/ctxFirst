/**
 * Persistence + in-memory cache of plugin authorization decisions.
 *
 * A `Grant` is the user's answer to the authorization dialog for a specific
 * `(pluginId, version)` pair:
 *  - `enabled` ∈ {0,1} — overall on/off switch (revocable from Settings).
 *  - `permissions` — the subset of the manifest's declared permissions that
 *    the user accepted. Subsequent revocations only shrink this set.
 *
 * Versioning rule: a grant is **bound to the manifest version**. Upgrading a
 * plugin to a new version invalidates the grant and forces a re-prompt — same
 * model as Obsidian when a plugin requests new permissions. This makes the
 * "permissions diff at upgrade" trivial to surface later.
 *
 * Built-in plugins skip persistence entirely; they get a synthesised grant
 * with every permission they declare. The grant is held only in memory.
 */
import type Database from "better-sqlite3";
import {
  PERMISSION_IDS,
  type PermissionId,
} from "./permissions-catalog";

export type GrantStatus = "granted" | "pending" | "denied";

export type Grant = {
  pluginId: string;
  version: string;
  enabled: boolean;
  permissions: ReadonlySet<PermissionId>;
  decidedAt: string;
  /** `true` when this grant is synthetic (built-in plugin, no DB row). */
  ephemeral: boolean;
};

export type GrantStore = {
  /**
   * Returns the persisted grant for a (pluginId, version), or `null` when
   * none has ever been recorded. Built-in plugins should not consult this —
   * they get an ephemeral grant from {@link makeBuiltinGrant}.
   */
  get(pluginId: string, version: string): Grant | null;
  /**
   * Replaces (or inserts) the grant for a (pluginId, version) with the given
   * set of permissions. Filters the input set against {@link PERMISSION_IDS}
   * so a manifest-only string can never sneak into the DB.
   */
  set(args: {
    pluginId: string;
    version: string;
    enabled: boolean;
    permissions: ReadonlyArray<string>;
  }): Grant;
  /** Convenience: flips the `enabled` flag without touching the permission set. */
  setEnabled(pluginId: string, version: string, enabled: boolean): Grant | null;
  /** Removes the grant (forces a re-prompt next boot). */
  clear(pluginId: string, version: string): void;
  /** Snapshot of every grant currently in the DB. */
  list(): ReadonlyArray<Grant>;
};

const ALL_PERMISSION_IDS: ReadonlySet<string> = new Set(PERMISSION_IDS);

type Row = {
  plugin_id: string;
  version: string;
  enabled: number;
  permissions: string;
  decided_at: string;
};

const rowToGrant = (row: Row): Grant => {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(row.permissions);
  } catch {
    parsed = [];
  }
  const ids = Array.isArray(parsed)
    ? parsed.filter((v): v is PermissionId =>
        typeof v === "string" && ALL_PERMISSION_IDS.has(v),
      )
    : [];
  return {
    pluginId: row.plugin_id,
    version: row.version,
    enabled: row.enabled === 1,
    permissions: new Set(ids),
    decidedAt: row.decided_at,
    ephemeral: false,
  };
};

export const createGrantStore = ({ db }: { db: Database.Database }): GrantStore => {
  const selectOne = db.prepare<
    [string, string],
    Row
  >(
    `SELECT plugin_id, version, enabled, permissions, decided_at
       FROM plugin_grants
      WHERE plugin_id = ? AND version = ?
      LIMIT 1`,
  );
  const selectAll = db.prepare<[], Row>(
    `SELECT plugin_id, version, enabled, permissions, decided_at
       FROM plugin_grants
      ORDER BY plugin_id ASC, version ASC`,
  );
  const upsert = db.prepare(
    `INSERT INTO plugin_grants (
       plugin_id, version, enabled, permissions, decided_at
     ) VALUES (
       @plugin_id, @version, @enabled, @permissions, @decided_at
     )
     ON CONFLICT(plugin_id, version) DO UPDATE SET
       enabled     = excluded.enabled,
       permissions = excluded.permissions,
       decided_at  = excluded.decided_at`,
  );
  const del = db.prepare(
    `DELETE FROM plugin_grants WHERE plugin_id = ? AND version = ?`,
  );

  return {
    get(pluginId, version) {
      const row = selectOne.get(pluginId, version);
      return row ? rowToGrant(row) : null;
    },
    set({ pluginId, version, enabled, permissions }) {
      const filtered = [
        ...new Set(
          permissions.filter((p): p is PermissionId => ALL_PERMISSION_IDS.has(p)),
        ),
      ];
      const decidedAt = new Date().toISOString();
      upsert.run({
        plugin_id: pluginId,
        version,
        enabled: enabled ? 1 : 0,
        permissions: JSON.stringify(filtered),
        decided_at: decidedAt,
      });
      return {
        pluginId,
        version,
        enabled,
        permissions: new Set(filtered),
        decidedAt,
        ephemeral: false,
      };
    },
    setEnabled(pluginId, version, enabled) {
      const existing = this.get(pluginId, version);
      if (!existing) return null;
      return this.set({
        pluginId,
        version,
        enabled,
        permissions: [...existing.permissions],
      });
    },
    clear(pluginId, version) {
      del.run(pluginId, version);
    },
    list() {
      return (selectAll.all()).map(rowToGrant);
    },
  };
};

/**
 * Synthesises an ephemeral grant for a built-in plugin. Built-ins are trusted
 * implicitly (they ship inside the app bundle), so every permission they
 * declare in their manifest is granted automatically and the result is never
 * persisted. Revoking a built-in permission from Settings still works — it
 * pushes a row into the DB that overrides the ephemeral grant.
 */
export const makeBuiltinGrant = (
  pluginId: string,
  version: string,
  declared: ReadonlyArray<PermissionId>,
): Grant => ({
  pluginId,
  version,
  enabled: true,
  permissions: new Set(declared),
  decidedAt: new Date().toISOString(),
  ephemeral: true,
});
