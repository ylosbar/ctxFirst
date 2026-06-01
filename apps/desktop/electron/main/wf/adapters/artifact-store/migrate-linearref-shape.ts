/**
 * One-shot rewrite of on-disk `LinearRef` artifacts: the §2 refinement of
 * `String` carries `{ value: string }`, replacing the legacy `{ ref: string }`
 * payload. Same idempotency guard as
 * {@link ./migrate-removed-kinds.ts} — a row in `app_settings` keyed by
 * {@link MIGRATION_KEY} ensures the migration runs at most once per DB.
 *
 * Hash recompute is required (the bytes have changed) so the file is renamed
 * to its new hash; the meta is rewritten with the new `hash`. The on-disk
 * `wf_artifacts` row is updated in step so reads keep resolving.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type Database from "better-sqlite3";

const MIGRATION_KEY = "artifacts:linearref-ref-to-value-shape";

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

const sha256Hex = (data: string): string =>
  crypto.createHash("sha256").update(data).digest("hex");

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
 * Rewrites every on-disk `LinearRef` artifact to the §2 `{ value }` shape and
 * keeps the SQLite `wf_artifacts` row in sync. Safe to call on every boot —
 * the `app_settings` guard short-circuits after the first successful run.
 */
export const migrateLinearRefShape = async (
  rootDir: string,
  db: Database.Database,
): Promise<void> => {
  if (hasBeenRun(db)) return;

  let entries: ReadonlyArray<string>;
  try {
    entries = await fs.readdir(rootDir);
  } catch {
    // Artifact dir doesn't exist yet (fresh install) — nothing to migrate.
    markRun(db);
    return;
  }

  // Prepared once outside the loop — the migration may touch many rows on a
  // long-running workspace.
  const updateRow = db.prepare(
    `UPDATE wf_artifacts SET hash = ?, storage_ref = ? WHERE id = ?`,
  );

  for (const name of entries) {
    if (!name.endsWith(".meta.json")) continue;
    const metaPath = path.join(rootDir, name);
    let meta: AnyMeta;
    try {
      meta = (await readJson(metaPath)) as AnyMeta;
    } catch {
      continue;
    }
    if (meta.kind !== "LinearRef") continue;

    const binPath =
      typeof meta.storageRef === "string" && meta.storageRef.length > 0
        ? meta.storageRef
        : path.join(rootDir, name.replace(/\.meta\.json$/, ".bin"));
    let content: string;
    try {
      content = await fs.readFile(binPath, "utf8");
    } catch {
      // Orphan meta with no bin: drop the meta — the bin is what carries the
      // payload, and a meta without a bin is unrecoverable.
      continue;
    }

    let value: string | null = null;
    try {
      const parsed = JSON.parse(content) as { ref?: unknown; value?: unknown };
      // Already migrated (or never under the legacy shape): leave alone.
      if (typeof parsed.value === "string" && !("ref" in parsed)) continue;
      if (typeof parsed.ref === "string") value = parsed.ref;
    } catch {
      // Non-JSON content shouldn't appear for a struct kind; skip rather than
      // guess.
      continue;
    }
    if (value === null) continue;

    const rewritten = JSON.stringify({ value });
    const newHash = sha256Hex(rewritten);
    const oldHash = typeof meta.hash === "string" ? meta.hash : null;
    const id = typeof meta.id === "string" ? meta.id : null;

    // Write the new bin next to the meta (or to the same parent dir as the
    // current `storageRef`). Atomic-enough for our needs: the store reads
    // `storageRef` from the meta, so the meta update is the visibility flip.
    const binDir = path.dirname(binPath);
    const newBinPath = path.join(binDir, `${newHash}.bin`);
    const newMetaPath = path.join(binDir, `${newHash}.meta.json`);

    await fs.writeFile(newBinPath, rewritten, "utf8");
    meta.hash = newHash;
    meta.storageRef = newBinPath;
    await writeJson(newMetaPath, meta);

    if (newBinPath !== binPath) {
      await fs.rm(binPath, { force: true });
    }
    if (newMetaPath !== metaPath) {
      await fs.rm(metaPath, { force: true });
    }

    if (id && oldHash !== newHash) {
      updateRow.run(newHash, newBinPath, id);
    }
  }

  markRun(db);
};
