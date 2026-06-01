/**
 * One-shot rewrite of on-disk `LinearTicket` artifacts: the kind moves from
 * the engine seed to the `linear` core plugin (cf.
 * `specs/artifact-type-system-refonte.md` §3). The simplified schema is
 * structurally identical, so the payload bytes are untouched — only the
 * `kind` field in each `.meta.json` flips from `"LinearTicket"` to
 * `"plugin:linear:Ticket@v1"`.
 *
 * Idempotent via the `app_settings` row keyed by {@link MIGRATION_KEY}: a
 * successful run flips the flag and subsequent boots short-circuit at the top.
 * Mirrors the pattern used by {@link ./migrate-removed-kinds.ts} and
 * {@link ./migrate-linearref-shape.ts}.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type Database from "better-sqlite3";

const MIGRATION_KEY = "artifacts:lineartiket-to-plugin";
const FROM_KIND = "LinearTicket";
const TO_KIND = "plugin:linear:Ticket@v1";

type AnyMeta = {
  id?: unknown;
  kind?: unknown;
  hash?: unknown;
  storageRef?: unknown;
  metadata?: unknown;
  createdAt?: unknown;
};

const readJson = async (file: string): Promise<unknown> => {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as unknown;
};

const writeJson = async (file: string, value: unknown): Promise<void> => {
  await fs.writeFile(file, JSON.stringify(value), "utf8");
};

const hasBeenRun = (db: Database.Database): boolean => {
  const row = db
    .prepare("SELECT 1 FROM app_settings WHERE key = ?")
    .get(MIGRATION_KEY);
  return row !== undefined;
};

const markRun = (db: Database.Database): void => {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, '1', ?)
     ON CONFLICT(key) DO NOTHING`,
  ).run(MIGRATION_KEY, new Date().toISOString());
};

/**
 * Rewrites every on-disk artifact with `kind: "LinearTicket"` to the new
 * plugin-scoped kind. The payload bin is **not** touched (same schema, same
 * hash). Safe to call on every boot — the `app_settings` guard short-circuits
 * once a successful pass has marked the migration done.
 */
export const migrateLinearTicketToPlugin = async (
  rootDir: string,
  db: Database.Database,
): Promise<void> => {
  if (hasBeenRun(db)) return;

  let entries: ReadonlyArray<string>;
  try {
    entries = await fs.readdir(rootDir);
  } catch {
    // Fresh install / no artifacts dir yet — nothing to migrate.
    markRun(db);
    return;
  }

  for (const name of entries) {
    if (!name.endsWith(".meta.json")) continue;
    const metaPath = path.join(rootDir, name);
    let meta: AnyMeta;
    try {
      meta = (await readJson(metaPath)) as AnyMeta;
    } catch {
      continue;
    }
    if (meta.kind !== FROM_KIND) continue;
    meta.kind = TO_KIND;
    await writeJson(metaPath, meta);
  }

  markRun(db);
};
