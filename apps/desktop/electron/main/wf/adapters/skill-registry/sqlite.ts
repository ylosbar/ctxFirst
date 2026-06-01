import type Database from "better-sqlite3";
import type { ChannelContext } from "../../application/ports/outbound/channel-context";
import type { SkillRegistry } from "../../application/ports/outbound/skill-registry";
import { DEFAULT_CHANNEL_ID } from "../../domain/channel";
import { asSkillRef, type SkillRef } from "../../domain/ids";
import type { Skill } from "../../domain/skill";
import { bindChannel, channelScopeWhere } from "../_shared/channel-scope";

type Deps = { db: Database.Database; channels: ChannelContext };

type Row = {
  ref: string;
  body: string;
  meta_json: string;
};

const rowToSkill = (row: Row): Skill => ({
  ref: asSkillRef(row.ref),
  body: row.body,
  meta: JSON.parse(row.meta_json) as Record<string, unknown>,
});

export const createSqliteSkillRegistry = (
  { db, channels }: Deps,
): SkillRegistry => {
  // `resolve(ref)` deliberately stays channel-agnostic: a workflow running in
  // channel A may legitimately reference a global skill or a skill scoped to
  // another channel (the orchestrator only ever sees refs already committed to
  // an instance, so cross-channel lookup is safe). The scope filter only
  // applies to user-facing listings.
  const selectOne = db.prepare(
    `SELECT ref, body, meta_json FROM wf_skills WHERE ref = ?`,
  );
  const selectAll = db.prepare(
    `SELECT ref, body, meta_json
       FROM wf_skills
      WHERE ${channelScopeWhere}
      ORDER BY ref ASC`,
  );
  const upsert = db.prepare(
    `INSERT INTO wf_skills (ref, body, meta_json, channel_id, created_at, updated_at)
     VALUES (@ref, @body, @meta_json, @channel_id, @now, @now)
     ON CONFLICT(ref) DO UPDATE SET
       body = excluded.body,
       meta_json = excluded.meta_json,
       updated_at = excluded.updated_at`,
  );
  const del = db.prepare(`DELETE FROM wf_skills WHERE ref = ?`);

  return {
    async resolve(ref: SkillRef): Promise<Skill> {
      const row = selectOne.get(ref) as Row | undefined;
      if (!row) throw new Error(`skill not found: ${ref}`);
      return rowToSkill(row);
    },
    async list(): Promise<ReadonlyArray<Skill>> {
      const rows = selectAll.all(bindChannel(channels)) as Row[];
      return rows.map(rowToSkill);
    },
    async save(skill: Skill): Promise<void> {
      upsert.run({
        ref: skill.ref,
        body: skill.body,
        meta_json: JSON.stringify(skill.meta),
        channel_id: channels.getActive(),
        now: new Date().toISOString(),
      });
    },
    async remove(ref: SkillRef): Promise<void> {
      del.run(ref);
    },
  };
};

// The seeding machinery below stays generic; populate this array with the
// curated starter skills shipped with the app. Intentionally empty: a fresh
// profile — and the state after a « Tout effacer » factory reset — ships no
// built-in skills.
const BUILTIN_SKILL_SEEDS: ReadonlyArray<Skill> = [];

/**
 * Inserts the built-in skills that aren't already present. Idempotent at
 * boot via `ON CONFLICT(ref) DO NOTHING` — user-edited bodies are preserved
 * while new builtins added in later app versions get inserted on next boot.
 */
export const seedBuiltinSkills = (db: Database.Database): void => {
  // Built-in seeds are assigned to the default channel — V1 wants no
  // unassigned rows. Users can later move them out via the "move to channel"
  // action if they want global scope.
  const insert = db.prepare(
    `INSERT INTO wf_skills (ref, body, meta_json, channel_id, created_at, updated_at)
     VALUES (@ref, @body, @meta_json, @channel_id, @now, @now)
     ON CONFLICT(ref) DO NOTHING`,
  );
  const now = new Date().toISOString();
  const run = db.transaction((skills: ReadonlyArray<Skill>) => {
    for (const s of skills) {
      insert.run({
        ref: s.ref,
        body: s.body,
        meta_json: JSON.stringify(s.meta),
        channel_id: DEFAULT_CHANNEL_ID,
        now,
      });
    }
  });
  run(BUILTIN_SKILL_SEEDS);
};
