import type { ExplorerFolder, FolderItem, ResourceKind } from "../../../domain/folder";

export interface FolderRepo {
  // Folders
  list(args: { channelId: string }): ExplorerFolder[];
  get(args: { id: string }): ExplorerFolder | null;
  listChildren(args: { parentId: string }): ExplorerFolder[];
  findByName(args: {
    channelId: string;
    parentId: string | null;
    name: string;
    excludeId?: string;
  }): ExplorerFolder | null;
  insert(args: {
    id: string;
    channelId: string;
    parentId: string | null;
    name: string;
    now: string;
  }): void;
  rename(args: { id: string; name: string; now: string }): void;
  setParent(args: { id: string; parentId: string | null; now: string }): void;
  delete(args: { id: string }): void;

  // Items
  listItems(args: { channelId: string }): FolderItem[];
  upsertItem(args: {
    channelId: string;
    kind: ResourceKind;
    resourceId: string;
    folderId: string;
    now: string;
  }): void;
  deleteItem(args: {
    channelId: string;
    kind: ResourceKind;
    resourceId: string;
  }): void;
  /**
   * Reassigns every item from one folder to another (or detaches them all when
   * `toFolderId` is `null`). Detaching means deleting the rows — a "root" item
   * has no row in `explorer_folder_items`.
   */
  reassignItems(args: {
    fromFolderId: string;
    toFolderId: string | null;
  }): void;

  transaction<T>(fn: () => T): T;
}
