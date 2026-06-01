/**
 * SQLite-backed {@link ParserRegistry}. Merges two sources at read time:
 *
 *  1. **Plugin contributions** — pushed via `setPluginContributions` after
 *     the loader runs. Held in memory; not persisted.
 *  2. **User rows** — `wf_parsers` table.
 *
 * The legacy `wf_artifact_schema_active_parser` pointer is gone (cf.
 * `specs/artifact-typing-overhaul.md` §Pilier B + migration v18). Parsers
 * are now invoked explicitly through `transform.run` steps.
 */
import type Database from "better-sqlite3";
import type { ChannelContext } from "../../application/ports/outbound/channel-context";
import type {
  ParserRegistry,
  PluginParserContribution,
} from "../../application/ports/outbound/parser-registry";
import type { ArtifactSchemaRef } from "../../domain/artifact-schema";
import type {
  ParserMode,
  ParserRecord,
  ParserRef,
  SaveUserParser,
} from "../../domain/parser";
import { bindChannel, channelScopeWhere } from "../_shared/channel-scope";

type Deps = { db: Database.Database; channels: ChannelContext };

type ParserRow = {
  id: string;
  version: string;
  type_id: string;
  type_version: string;
  mode: ParserMode;
  body_json: string;
  meta_json: string;
};

const rowToRecord = (row: ParserRow): ParserRecord => ({
  id: row.id,
  version: row.version,
  forType: { id: row.type_id, version: row.type_version },
  mode: row.mode,
  body: JSON.parse(row.body_json),
  source: { kind: "user" },
  meta: JSON.parse(row.meta_json) as Record<string, unknown>,
});

const sameRef = (a: ParserRef | ArtifactSchemaRef, b: ParserRef | ArtifactSchemaRef) =>
  a.id === b.id && a.version === b.version;

export const createSqliteParserRegistry = (
  { db, channels }: Deps,
): ParserRegistry => {
  // List queries (user-facing) are channel-scoped; `selectOne` is unscoped
  // because `resolve(ref)` is the cross-channel lookup path consulted by the
  // orchestrator at runtime.
  const selectAll = db.prepare(
    `SELECT id, version, type_id, type_version, mode, body_json, meta_json
       FROM wf_parsers
      WHERE ${channelScopeWhere}
      ORDER BY type_id ASC, type_version ASC, id ASC, version ASC`,
  );
  const selectForType = db.prepare(
    `SELECT id, version, type_id, type_version, mode, body_json, meta_json
       FROM wf_parsers
      WHERE type_id = @type_id AND type_version = @type_version
        AND ${channelScopeWhere}
      ORDER BY id ASC, version ASC`,
  );
  const selectOne = db.prepare(
    `SELECT id, version, type_id, type_version, mode, body_json, meta_json
       FROM wf_parsers
      WHERE id = ? AND version = ?
      LIMIT 1`,
  );
  const upsert = db.prepare(
    `INSERT INTO wf_parsers (
       id, version, type_id, type_version, mode, body_json, meta_json, channel_id, created_at
     ) VALUES (
       @id, @version, @type_id, @type_version, @mode, @body_json, @meta_json, @channel_id, @now
     )
     ON CONFLICT(id, version) DO UPDATE SET
       type_id      = excluded.type_id,
       type_version = excluded.type_version,
       mode         = excluded.mode,
       body_json    = excluded.body_json,
       meta_json    = excluded.meta_json`,
  );
  const del = db.prepare(`DELETE FROM wf_parsers WHERE id = ? AND version = ?`);

  let pluginRecords: ReadonlyArray<ParserRecord> = [];

  const userRecords = (): ReadonlyArray<ParserRecord> =>
    (selectAll.all(bindChannel(channels)) as ParserRow[]).map(rowToRecord);

  return {
    list(forType?: ArtifactSchemaRef): ReadonlyArray<ParserRecord> {
      if (!forType) {
        return [...pluginRecords, ...userRecords()];
      }
      const plugin = pluginRecords.filter((p) => sameRef(p.forType, forType));
      const user = (selectForType.all({
        type_id: forType.id,
        type_version: forType.version,
        ...bindChannel(channels),
      }) as ParserRow[]).map(rowToRecord);
      return [...plugin, ...user];
    },

    resolve(ref: ParserRef): ParserRecord | null {
      const inPlugin = pluginRecords.find((p) => sameRef(p, ref));
      if (inPlugin) return inPlugin;
      const row = selectOne.get(ref.id, ref.version) as ParserRow | undefined;
      return row ? rowToRecord(row) : null;
    },

    async save(parser: SaveUserParser): Promise<void> {
      upsert.run({
        id: parser.id,
        version: parser.version,
        type_id: parser.forType.id,
        type_version: parser.forType.version,
        mode: parser.mode,
        body_json: JSON.stringify(parser.body),
        meta_json: JSON.stringify(parser.meta ?? {}),
        channel_id: channels.getActive(),
        now: new Date().toISOString(),
      });
    },

    async remove(ref: ParserRef): Promise<void> {
      del.run(ref.id, ref.version);
    },

    setPluginContributions(
      contributions: ReadonlyArray<PluginParserContribution>,
    ): void {
      pluginRecords = contributions.flatMap(({ pluginId, parsers }) =>
        parsers.map<ParserRecord>((p) => ({
          id: p.id,
          version: p.version,
          forType: p.forType,
          mode: p.mode,
          body: p.body,
          source: { kind: "plugin", pluginId },
          meta: p.meta ?? {},
        })),
      );
    },
  };
};
