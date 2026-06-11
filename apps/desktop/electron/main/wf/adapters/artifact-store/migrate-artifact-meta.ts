/**
 * Shared primitive for one-shot, on-disk artifact migrations (spec
 * `techstrategy-artifact-types-solution.md` §2.2, Palier P2).
 *
 * The fs-store keeps each artifact as a pair `<hash>.meta.json` + `<hash>.bin`
 * under `rootDir`. Every historical migration (`migrate-removed-kinds`,
 * `migrate-linearref-shape`, `migrate-linearticket-to-plugin`) re-implemented
 * the *same* boilerplate: an `app_settings` run-once guard, a fresh-install
 * fallback, the `*.meta.json` scan with JSON-parse-or-skip, and the
 * `storageRef`-or-derived `.bin` resolution. The shape-changing ones *also*
 * duplicated the hash-recompute + rename + `wf_artifacts` row update.
 *
 * Two helpers factor that out so the next engineer-authored migration is a
 * pure visitor:
 *  - {@link forEachArtifactMeta} — the walker (guard, scan, resolve, mark-run).
 *  - {@link putRewrittenBin} — content-addressed bin rewrite (hash, rename,
 *    keep `wf_artifacts` in sync).
 *
 * The three label-flip / shape-change migrations are expressed on top of this;
 * each keeps its original `app_settings` key, so idempotence on existing DBs is
 * unchanged (a DB that already ran a migration short-circuits at the guard).
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type Database from "better-sqlite3";

/**
 * The subset of an artifact `.meta.json` the migrations read or mutate. Every
 * field is `unknown` because these files were written by older builds and may
 * predate any given field; callers narrow before use.
 */
export type ArtifactMeta = {
  id?: unknown;
  kind?: unknown;
  hash?: unknown;
  storageRef?: unknown;
  metadata?: unknown;
  createdAt?: unknown;
};

/**
 * What a visitor asks the walker to do with the current artifact:
 *  - `skip` — leave the pair untouched (non-matching kind, orphan, already
 *    migrated).
 *  - `write-meta` — the visitor mutated `meta` in place; persist it back to its
 *    existing `metaPath`. Use for label-only flips (no bin change).
 *  - `rewrite-bin` — the bytes changed; hand off to {@link putRewrittenBin},
 *    which recomputes the hash, renames the pair, and updates `wf_artifacts`.
 *    Any `meta` mutation the visitor made (e.g. a `kind` flip) is carried into
 *    the rewritten meta.
 */
export type MetaDirective =
  | { action: "skip" }
  | { action: "write-meta" }
  | { action: "rewrite-bin"; newBytes: string };

export type ArtifactMetaContext = {
  meta: ArtifactMeta;
  metaPath: string;
  binPath: string;
  db: Database.Database;
};

export type ArtifactMetaVisitor = (
  ctx: ArtifactMetaContext,
) => MetaDirective | Promise<MetaDirective>;

const readJson = async (file: string): Promise<unknown> => {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as unknown;
};

const writeJson = async (file: string, value: unknown): Promise<void> => {
  await fs.writeFile(file, JSON.stringify(value), "utf8");
};

const sha256Hex = (data: string): string =>
  crypto.createHash("sha256").update(data).digest("hex");

const hasBeenRun = (db: Database.Database, migrationKey: string): boolean => {
  const row = db
    .prepare("SELECT 1 FROM app_settings WHERE key = ?")
    .get(migrationKey);
  return row !== undefined;
};

const markRun = (db: Database.Database, migrationKey: string): void => {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, '1', ?)
     ON CONFLICT(key) DO NOTHING`,
  ).run(migrationKey, new Date().toISOString());
};

/**
 * Content-addressed rewrite of one artifact's payload. Writes `newBytes` under
 * its fresh `sha256` name, points `meta.hash`/`meta.storageRef` at the new pair,
 * removes the stale files when the name changed, and keeps the `wf_artifacts`
 * row in sync so reads keep resolving. Lifts
 * {@link ./migrate-linearref-shape.ts} 's per-row body verbatim.
 *
 * The visitor may have mutated other `meta` fields (e.g. `kind`) before
 * returning `rewrite-bin`; those are persisted as part of the new meta.
 */
export const putRewrittenBin = async ({
  db,
  meta,
  metaPath,
  binPath,
  newBytes,
}: {
  db: Database.Database;
  meta: ArtifactMeta;
  metaPath: string;
  binPath: string;
  newBytes: string;
}): Promise<void> => {
  const newHash = sha256Hex(newBytes);
  const oldHash = typeof meta.hash === "string" ? meta.hash : null;
  const id = typeof meta.id === "string" ? meta.id : null;

  // Write the new bin next to the current one (the meta carries an absolute
  // `storageRef`, so the parent dir — not `rootDir` — is the anchor). The meta
  // update is the visibility flip: the store reads `storageRef` from the meta.
  const binDir = path.dirname(binPath);
  const newBinPath = path.join(binDir, `${newHash}.bin`);
  const newMetaPath = path.join(binDir, `${newHash}.meta.json`);

  await fs.writeFile(newBinPath, newBytes, "utf8");
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
    db.prepare(
      `UPDATE wf_artifacts SET hash = ?, storage_ref = ? WHERE id = ?`,
    ).run(newHash, newBinPath, id);
  }
};

/**
 * Runs `visitor` over every on-disk artifact `.meta.json` under `rootDir`,
 * exactly once per DB (gated by `migrationKey` in `app_settings`).
 *
 * The walker owns all the boilerplate the three migrations used to repeat:
 *  - the `hasBeenRun`/`markRun` run-once guard,
 *  - the fresh-install fallback (`readdir` throws → mark done, nothing to do),
 *  - the `*.meta.json` scan with JSON-parse-or-skip,
 *  - the `storageRef`-or-derived `.bin` path resolution.
 *
 * The visitor receives `{ meta, metaPath, binPath, db }`, may mutate `meta`
 * and/or read `binPath`, and returns a {@link MetaDirective}. The walker applies
 * the directive (persist meta, or rewrite the bin) and calls `markRun` once the
 * full pass completes — so a crash mid-pass re-runs the whole migration, which
 * every visitor is written to tolerate (idempotent per artifact).
 */
export const forEachArtifactMeta = async (
  rootDir: string,
  db: Database.Database,
  migrationKey: string,
  visitor: ArtifactMetaVisitor,
): Promise<void> => {
  if (hasBeenRun(db, migrationKey)) return;

  let entries: ReadonlyArray<string>;
  try {
    entries = await fs.readdir(rootDir);
  } catch {
    // Artifact dir doesn't exist yet (fresh install) — nothing to migrate.
    markRun(db, migrationKey);
    return;
  }

  for (const name of entries) {
    if (!name.endsWith(".meta.json")) continue;
    const metaPath = path.join(rootDir, name);
    let meta: ArtifactMeta;
    try {
      meta = (await readJson(metaPath)) as ArtifactMeta;
    } catch {
      continue;
    }

    // `storageRef` is the absolute path written when the artifact was first
    // put; follow it rather than re-deriving from the hash so renamed root
    // dirs still resolve. Fall back to the sibling `.bin` for legacy metas.
    const binPath =
      typeof meta.storageRef === "string" && meta.storageRef.length > 0
        ? meta.storageRef
        : path.join(rootDir, name.replace(/\.meta\.json$/, ".bin"));

    const directive = await visitor({ meta, metaPath, binPath, db });
    if (directive.action === "skip") continue;
    if (directive.action === "write-meta") {
      await writeJson(metaPath, meta);
      continue;
    }
    // action === "rewrite-bin"
    await putRewrittenBin({
      db,
      meta,
      metaPath,
      binPath,
      newBytes: directive.newBytes,
    });
  }

  markRun(db, migrationKey);
};
