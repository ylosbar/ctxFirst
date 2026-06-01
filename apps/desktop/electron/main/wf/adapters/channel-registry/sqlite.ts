import type Database from "better-sqlite3";
import {
  DEFAULT_CHANNEL_ID,
  type Channel,
  type ChannelIconImageMime,
} from "../../../wf/domain/channel";
import type {
  ChannelPersistDraft,
  ChannelRegistry,
} from "../../application/ports/outbound/channel-registry";

type Deps = { db: Database.Database };

type Row = {
  id: string;
  name: string;
  description: string;
  color: string | null;
  icon_image_path: string | null;
  icon_image_mime: ChannelIconImageMime | null;
  created_at: string;
  updated_at: string;
};

const rowToChannel = (row: Row): Channel => ({
  id: row.id,
  name: row.name,
  description: row.description,
  color: row.color,
  iconImagePath: row.icon_image_path,
  iconImageMime: row.icon_image_mime,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createSqliteChannelRegistry = ({ db }: Deps): ChannelRegistry => {
  const SELECT_COLS = `id, name, description, color,
                       icon_image_path, icon_image_mime,
                       created_at, updated_at`;
  const selectAll = db.prepare(
    `SELECT ${SELECT_COLS} FROM channels ORDER BY id ASC`,
  );
  const selectOne = db.prepare(
    `SELECT ${SELECT_COLS} FROM channels WHERE id = ?`,
  );
  // `iconImageTouched` is the sentinel that switches between "ignore" and
  // "overwrite" semantics for the image columns on UPDATE — see save-channel.
  const upsert = db.prepare(
    `INSERT INTO channels (id, name, description, color,
                           icon_image_path, icon_image_mime,
                           created_at, updated_at)
     VALUES (@id, @name, @description, @color,
             @iconImagePath, @iconImageMime, @now, @now)
     ON CONFLICT(id) DO UPDATE SET
       name             = excluded.name,
       description      = excluded.description,
       color            = excluded.color,
       icon_image_path  = CASE WHEN @iconImageTouched = 1
                                 THEN @iconImagePath
                                 ELSE channels.icon_image_path END,
       icon_image_mime  = CASE WHEN @iconImageTouched = 1
                                 THEN @iconImageMime
                                 ELSE channels.icon_image_mime END,
       updated_at       = excluded.updated_at`,
  );
  const del = db.prepare(`DELETE FROM channels WHERE id = ?`);

  return {
    async list() {
      return (selectAll.all() as Row[]).map(rowToChannel);
    },
    async get(id: string) {
      const row = selectOne.get(id) as Row | undefined;
      return row ? rowToChannel(row) : null;
    },
    async save(channel: ChannelPersistDraft) {
      const iconImageTouched = channel.iconImagePath !== undefined ? 1 : 0;
      upsert.run({
        id: channel.id,
        name: channel.name,
        description: channel.description ?? "",
        color: channel.color ?? null,
        iconImagePath: channel.iconImagePath ?? null,
        iconImageMime: channel.iconImageMime ?? null,
        iconImageTouched,
        now: new Date().toISOString(),
      });
    },
    async remove(id: string) {
      del.run(id);
    },
  };
};

/**
 * Ensures the default channel row exists. Migration v12 seeds it once on
 * first install, but any flow that empties `channels` after that (notably
 * the dev `wipe-db` script) leaves dependent seed inserts — skills,
 * templates — failing on FOREIGN KEY. Calling this at boot before the other
 * seeds keeps the engine bootable in that recovered state.
 */
export const seedDefaultChannel = (db: Database.Database): void => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO channels (id, name, description, created_at, updated_at)
     VALUES (?, 'Personal', 'Channel par défaut.', ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(DEFAULT_CHANNEL_ID, now, now);
};
