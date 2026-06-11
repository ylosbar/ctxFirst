/**
 * One-shot rewrite of on-disk `LinearTicket` artifacts: the kind moves from
 * the engine seed to the `linear` core plugin (cf.
 * `specs/artifact-type-system-refonte.md` §3). The simplified schema is
 * structurally identical, so the payload bytes are untouched — only the
 * `kind` field in each `.meta.json` flips from `"LinearTicket"` to
 * `"plugin:linear:Ticket@v1"`.
 *
 * Built on the shared {@link ./migrate-artifact-meta.ts} primitive: the visitor
 * is the label flip, the walker owns the run-once guard (keyed by
 * {@link MIGRATION_KEY}), the fresh-install fallback, and the meta scan.
 */
import { forEachArtifactMeta } from "./migrate-artifact-meta";
import type Database from "better-sqlite3";

const MIGRATION_KEY = "artifacts:lineartiket-to-plugin";
const FROM_KIND = "LinearTicket";
const TO_KIND = "plugin:linear:Ticket@v1";

/**
 * Rewrites every on-disk artifact with `kind: "LinearTicket"` to the new
 * plugin-scoped kind. The payload bin is **not** touched (same schema, same
 * hash). Safe to call on every boot — the `app_settings` guard short-circuits
 * once a successful pass has marked the migration done.
 */
export const migrateLinearTicketToPlugin = async (
  rootDir: string,
  db: Database.Database,
): Promise<void> =>
  forEachArtifactMeta(rootDir, db, MIGRATION_KEY, ({ meta }) => {
    if (meta.kind !== FROM_KIND) return { action: "skip" };
    meta.kind = TO_KIND;
    return { action: "write-meta" };
  });
