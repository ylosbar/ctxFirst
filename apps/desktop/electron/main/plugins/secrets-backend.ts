/**
 * SQLite-backed secrets store scoped per `(pluginId, key)`. The value bytes
 * are passed through `safeStorage.encryptString` on the way in (when the OS
 * keychain is available) — this file holds the storage half only; the
 * encryption/decryption transition happens in `permissions.ts` so the API
 * surface stays one cohesive unit.
 *
 * Scoping is enforced here (not by the API caller) so that a future audit
 * can't tell whether a plugin "tried to read another plugin's secret" — the
 * statement simply can't reach a row outside its own pluginId.
 *
 * Uses the existing `app_settings` table under the namespace
 * `plugin-secret:<pluginId>:<key>` for now — avoids a new migration just for
 * an extra row layout. The value is stored hex-encoded so we don't have to
 * reach for the BLOB column type.
 */
import type Database from "better-sqlite3";
import type { SecretsBackend } from "./permissions";

const SETTINGS_KEY = (pluginId: string, key: string) =>
  `plugin-secret:${pluginId}:${key}`;

export const createSqliteSecretsBackend = ({
  db,
}: {
  db: Database.Database;
}): SecretsBackend => {
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const selectOne = db.prepare<[string], { value: string }>(
    `SELECT value FROM app_settings WHERE key = ? LIMIT 1`,
  );
  const del = db.prepare(`DELETE FROM app_settings WHERE key = ?`);

  return {
    read(pluginId, key) {
      const row = selectOne.get(SETTINGS_KEY(pluginId, key));
      if (!row) return null;
      try {
        return Buffer.from(row.value, "hex");
      } catch {
        return null;
      }
    },
    write(pluginId, key, value) {
      upsert.run(
        SETTINGS_KEY(pluginId, key),
        value.toString("hex"),
        new Date().toISOString(),
      );
    },
    remove(pluginId, key) {
      del.run(SETTINGS_KEY(pluginId, key));
    },
  };
};
