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
 * Built on the shared {@link ./migrate-artifact-meta.ts} primitive (keyed by
 * {@link MIGRATION_KEY}): label flips return `write-meta`; the `Keyword`
 * reshape returns `rewrite-bin`, so the walker recomputes the hash, renames the
 * pair, and updates the `wf_artifacts` row in step.
 */
import fs from "node:fs/promises";
import { forEachArtifactMeta } from "./migrate-artifact-meta";
import type Database from "better-sqlite3";

const MIGRATION_KEY = "artifacts:folded-removed-kinds-into-markdown";

const REMOVED_TEXT_KINDS = new Set(["TechSpec", "CodePatch", "QuestionList"]);

/**
 * Rewrites on-disk artifact metadata (and `Keyword` payloads) so that all
 * references to the removed kinds resolve to `Markdown`. Safe to call on
 * every boot — only the first call does work.
 */
export const migrateRemovedArtifactKinds = async (
  rootDir: string,
  db: Database.Database,
): Promise<void> =>
  forEachArtifactMeta(rootDir, db, MIGRATION_KEY, async ({ meta, binPath }) => {
    const kind = meta.kind;
    if (typeof kind !== "string") return { action: "skip" };

    if (REMOVED_TEXT_KINDS.has(kind)) {
      meta.kind = "Markdown";
      return { action: "write-meta" };
    }
    if (kind !== "Keyword") return { action: "skip" };

    // Keyword payload `{value:string}` → Markdown envelope `{format,body}`.
    let content: string;
    try {
      content = await fs.readFile(binPath, "utf8");
    } catch {
      // No bin file — flip the label so the orphan stops flagging.
      meta.kind = "Markdown";
      return { action: "write-meta" };
    }

    let body = "";
    try {
      const parsed = JSON.parse(content) as { value?: unknown };
      if (typeof parsed.value === "string") body = parsed.value;
    } catch {
      body = content;
    }

    meta.kind = "Markdown";
    return {
      action: "rewrite-bin",
      newBytes: JSON.stringify({ format: "markdown", body }),
    };
  });
