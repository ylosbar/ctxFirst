/**
 * One-shot rewrite of on-disk `LinearRef` artifacts: the §2 refinement of
 * `String` carries `{ value: string }`, replacing the legacy `{ ref: string }`
 * payload. Built on the shared {@link ./migrate-artifact-meta.ts} primitive —
 * the run-once guard (keyed by {@link MIGRATION_KEY}), the meta scan, and the
 * fresh-install fallback come from the walker.
 *
 * The bytes change, so the visitor returns `rewrite-bin`: the walker hands off
 * to `putRewrittenBin`, which recomputes the hash, renames the pair to the new
 * hash, and updates the `wf_artifacts` row in step so reads keep resolving.
 */
import fs from "node:fs/promises";
import { forEachArtifactMeta } from "./migrate-artifact-meta";
import type Database from "better-sqlite3";

const MIGRATION_KEY = "artifacts:linearref-ref-to-value-shape";

/**
 * Rewrites every on-disk `LinearRef` artifact to the §2 `{ value }` shape and
 * keeps the SQLite `wf_artifacts` row in sync. Safe to call on every boot —
 * the `app_settings` guard short-circuits after the first successful run.
 */
export const migrateLinearRefShape = async (
  rootDir: string,
  db: Database.Database,
): Promise<void> =>
  forEachArtifactMeta(rootDir, db, MIGRATION_KEY, async ({ meta, binPath }) => {
    if (meta.kind !== "LinearRef") return { action: "skip" };

    let content: string;
    try {
      content = await fs.readFile(binPath, "utf8");
    } catch {
      // Orphan meta with no bin: leave it — the bin is what carries the
      // payload, and a meta without a bin is unrecoverable.
      return { action: "skip" };
    }

    let value: string | null = null;
    try {
      const parsed = JSON.parse(content) as { ref?: unknown; value?: unknown };
      // Already migrated (or never under the legacy shape): leave alone.
      if (typeof parsed.value === "string" && !("ref" in parsed)) {
        return { action: "skip" };
      }
      if (typeof parsed.ref === "string") value = parsed.ref;
    } catch {
      // Non-JSON content shouldn't appear for a struct kind; skip rather than
      // guess.
      return { action: "skip" };
    }
    if (value === null) return { action: "skip" };

    return { action: "rewrite-bin", newBytes: JSON.stringify({ value }) };
  });
