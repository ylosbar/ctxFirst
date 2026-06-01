import type Database from "better-sqlite3";
import type { FolderRepo } from "../../application/ports/outbound/folder-repo";
import type {
  ExplorerFolder,
  FolderItem,
  ResourceKind,
} from "../../domain/folder";

type FolderRow = {
  id: string;
  channel_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
};

// The DB column is still named `section` (cosmetic; no rebuild needed) — it
// stores the resource kind tag and feeds the PK `(channel_id, section,
// resource_id)`, which prevents template/artifact-schema id collisions now that
// folders are type-agnostic.
type ItemRow = {
  channel_id: string;
  section: string;
  resource_id: string;
  folder_id: string;
};

const rowToFolder = (r: FolderRow): ExplorerFolder => ({
  id: r.id,
  channelId: r.channel_id,
  parentId: r.parent_id,
  name: r.name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const rowToItem = (r: ItemRow): FolderItem => ({
  channelId: r.channel_id,
  kind: r.section as ResourceKind,
  resourceId: r.resource_id,
  folderId: r.folder_id,
});

export const createSqliteFolderRepo = (db: Database.Database): FolderRepo => {
  const stmtList = db.prepare(
    `SELECT id, channel_id, parent_id, name, created_at, updated_at
       FROM explorer_folders
      WHERE channel_id = ?`,
  );
  const stmtGet = db.prepare(
    `SELECT id, channel_id, parent_id, name, created_at, updated_at
       FROM explorer_folders WHERE id = ?`,
  );
  const stmtListChildren = db.prepare(
    `SELECT id, channel_id, parent_id, name, created_at, updated_at
       FROM explorer_folders WHERE parent_id = ?`,
  );
  const stmtFindByNameNullParent = db.prepare(
    `SELECT id, channel_id, parent_id, name, created_at, updated_at
       FROM explorer_folders
      WHERE channel_id = @channelId
        AND parent_id IS NULL
        AND LOWER(name) = LOWER(@name)
        AND id != @excludeId
      LIMIT 1`,
  );
  const stmtFindByNameWithParent = db.prepare(
    `SELECT id, channel_id, parent_id, name, created_at, updated_at
       FROM explorer_folders
      WHERE channel_id = @channelId
        AND parent_id = @parentId
        AND LOWER(name) = LOWER(@name)
        AND id != @excludeId
      LIMIT 1`,
  );
  const stmtInsert = db.prepare(
    `INSERT INTO explorer_folders
       (id, channel_id, parent_id, name, created_at, updated_at)
     VALUES
       (@id, @channelId, @parentId, @name, @now, @now)`,
  );
  const stmtRename = db.prepare(
    `UPDATE explorer_folders SET name = @name, updated_at = @now WHERE id = @id`,
  );
  const stmtSetParent = db.prepare(
    `UPDATE explorer_folders SET parent_id = @parentId, updated_at = @now WHERE id = @id`,
  );
  const stmtDelete = db.prepare(`DELETE FROM explorer_folders WHERE id = ?`);

  const stmtListItems = db.prepare(
    `SELECT channel_id, section, resource_id, folder_id
       FROM explorer_folder_items
      WHERE channel_id = ?`,
  );
  const stmtUpsertItem = db.prepare(
    `INSERT INTO explorer_folder_items
       (channel_id, section, resource_id, folder_id, assigned_at)
     VALUES
       (@channelId, @kind, @resourceId, @folderId, @now)
     ON CONFLICT(channel_id, section, resource_id) DO UPDATE SET
       folder_id   = excluded.folder_id,
       assigned_at = excluded.assigned_at`,
  );
  const stmtDeleteItem = db.prepare(
    `DELETE FROM explorer_folder_items
      WHERE channel_id = ? AND section = ? AND resource_id = ?`,
  );
  const stmtReassignItems = db.prepare(
    `UPDATE explorer_folder_items SET folder_id = @toFolderId
      WHERE folder_id = @fromFolderId`,
  );
  const stmtDeleteItemsByFolder = db.prepare(
    `DELETE FROM explorer_folder_items WHERE folder_id = ?`,
  );

  return {
    list: ({ channelId }) =>
      (stmtList.all(channelId) as FolderRow[]).map(rowToFolder),

    get: ({ id }) => {
      const row = stmtGet.get(id) as FolderRow | undefined;
      return row ? rowToFolder(row) : null;
    },

    listChildren: ({ parentId }) =>
      (stmtListChildren.all(parentId) as FolderRow[]).map(rowToFolder),

    findByName: ({ channelId, parentId, name, excludeId }) => {
      const excl = excludeId ?? "";
      const row =
        parentId === null
          ? (stmtFindByNameNullParent.get({
              channelId,
              name,
              excludeId: excl,
            }) as FolderRow | undefined)
          : (stmtFindByNameWithParent.get({
              channelId,
              parentId,
              name,
              excludeId: excl,
            }) as FolderRow | undefined);
      return row ? rowToFolder(row) : null;
    },

    insert: (args) => {
      stmtInsert.run(args);
    },

    rename: (args) => {
      stmtRename.run(args);
    },

    setParent: (args) => {
      stmtSetParent.run(args);
    },

    delete: ({ id }) => {
      stmtDelete.run(id);
    },

    listItems: ({ channelId }) =>
      (stmtListItems.all(channelId) as ItemRow[]).map(rowToItem),

    upsertItem: (args) => {
      stmtUpsertItem.run(args);
    },

    deleteItem: ({ channelId, kind, resourceId }) => {
      stmtDeleteItem.run(channelId, kind, resourceId);
    },

    reassignItems: ({ fromFolderId, toFolderId }) => {
      if (toFolderId === null) {
        stmtDeleteItemsByFolder.run(fromFolderId);
      } else {
        stmtReassignItems.run({ fromFolderId, toFolderId });
      }
    },

    transaction: <T,>(fn: () => T): T => db.transaction(fn)(),
  };
};
