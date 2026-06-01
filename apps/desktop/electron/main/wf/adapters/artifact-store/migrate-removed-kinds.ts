/**
 * One-shot cleanup of on-disk artifacts whose `kind` was removed in the
 * migration that folded `TechSpec` / `CodePatch` / `QuestionList` / `Keyword`
 * into `Markdown`.
 *
 * The fs-store keeps each artifact as a pair `<hash>.meta.json` + `<hash>.bin`
 * under `rootDir`. The SQLite migration v17 rewrites references inside event
 * payloads and template/skill JSON columns, but cannot touch these files.
 *
 * For TechSpec / CodePatch / QuestionList the bin content is already a valid
 * Markdown envelope (`{format,body}`); only the kind label needs rewriting.
 * `Keyword` had a different payload shape (`{value:string}`); we rewrite the
 * bin to a Markdown envelope using `value` as the body.
 *
 * Idempotent via the `app_settings` row keyed by `MIGRATION_KEY` — runs at
 * most once per database.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type Database from "better-sqlite3";

const MIGRATION_KEY = "artifacts:folded-removed-kinds-into-markdown";

const REMOVED_TEXT_KINDS = new Set(["TechSpec", "CodePatch", "QuestionList"]);

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
 * Rewrites on-disk artifact metadata (and `Keyword` payloads) so that all
 * references to the removed kinds resolve to `Markdown`. Safe to call on
 * every boot — only the first call does work.
 */
export const migrateRemovedArtifactKinds = async (
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

  for (const name of entries) {
    if (!name.endsWith(".meta.json")) continue;
    const metaPath = path.join(rootDir, name);
    let meta: AnyMeta;
    try {
      meta = (await readJson(metaPath)) as AnyMeta;
    } catch {
      continue;
    }
    const kind = meta.kind;
    if (typeof kind !== "string") continue;

    if (REMOVED_TEXT_KINDS.has(kind)) {
      meta.kind = "Markdown";
      await writeJson(metaPath, meta);
      continue;
    }
    if (kind !== "Keyword") continue;

    // Keyword payload `{value:string}` → Markdown envelope `{format,body}`.
    // `storageRef` is an absolute path written when the artifact was first
    // put; we follow it rather than re-deriving from the hash so renamed
    // root dirs still resolve.
    const binPath =
      typeof meta.storageRef === "string" && meta.storageRef.length > 0
        ? meta.storageRef
        : path.join(rootDir, name.replace(/\.meta\.json$/, ".bin"));
    let content: string;
    try {
      content = await fs.readFile(binPath, "utf8");
    } catch {
      // No bin file — drop the meta so the orphan doesn't keep flagging.
      meta.kind = "Markdown";
      await writeJson(metaPath, meta);
      continue;
    }

    let body = "";
    try {
      const parsed = JSON.parse(content) as { value?: unknown };
      if (typeof parsed.value === "string") body = parsed.value;
    } catch {
      body = content;
    }
    const rewritten = JSON.stringify({ format: "markdown", body });
    await fs.writeFile(binPath, rewritten, "utf8");

    meta.kind = "Markdown";
    await writeJson(metaPath, meta);
  }

  markRun(db);
};
