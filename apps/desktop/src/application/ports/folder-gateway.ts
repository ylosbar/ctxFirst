import type {
  ExplorerFolderView,
  FolderItemAssignment,
  FoldersChangedEvent,
  ResourceKind,
} from "../../domain/explorer/folder";

export type Unsubscribe = () => void;

export interface FolderGateway {
  list(args: { channelId: string }): Promise<ReadonlyArray<ExplorerFolderView>>;
  create(args: {
    channelId: string;
    parentId: string | null;
    name: string;
  }): Promise<ExplorerFolderView>;
  rename(args: { id: string; name: string }): Promise<void>;
  remove(args: {
    id: string;
    strategy?: "detach-items" | "cascade";
  }): Promise<void>;
  move(args: { id: string; parentId: string | null }): Promise<void>;
  listItems(args: {
    channelId: string;
  }): Promise<ReadonlyArray<FolderItemAssignment>>;
  assign(args: {
    channelId: string;
    kind: ResourceKind;
    resourceId: string;
    folderId: string | null;
  }): Promise<void>;
  onChanged(listener: (evt: FoldersChangedEvent) => void): Unsubscribe;
}
