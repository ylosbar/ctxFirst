import { EventEmitter } from "node:events";
import type Database from "better-sqlite3";
import type { ClockPort } from "../wf/application/ports/outbound/clock";
import type { IdGenerator } from "../wf/application/ports/outbound/id-generator";
import { createSqliteFolderRepo } from "./adapters/folder-repo/sqlite-folder-repo";
import { makeAssignResource } from "./application/use-cases/assign-resource";
import { makeCreateFolder } from "./application/use-cases/create-folder";
import { makeDeleteFolder } from "./application/use-cases/delete-folder";
import { makeListAssignments } from "./application/use-cases/list-assignments";
import { makeListFolders } from "./application/use-cases/list-folders";
import { makeMoveFolder } from "./application/use-cases/move-folder";
import { makeRenameFolder } from "./application/use-cases/rename-folder";
import type { ExplorerFolder, FolderItem, ResourceKind } from "./domain/folder";

export type FoldersChangedEvent = {
  channelId: string;
};

export type ExplorerService = {
  listFolders: (input: {
    channelId: string;
  }) => Promise<ReadonlyArray<ExplorerFolder>>;
  createFolder: (input: {
    channelId: string;
    parentId: string | null;
    name: string;
  }) => Promise<ExplorerFolder>;
  renameFolder: (input: { id: string; name: string }) => Promise<void>;
  deleteFolder: (input: {
    id: string;
    strategy?: "detach-items" | "cascade";
  }) => Promise<void>;
  moveFolder: (input: {
    id: string;
    parentId: string | null;
  }) => Promise<void>;
  listAssignments: (input: {
    channelId: string;
  }) => Promise<ReadonlyArray<FolderItem>>;
  assignResource: (input: {
    channelId: string;
    kind: ResourceKind;
    resourceId: string;
    folderId: string | null;
  }) => Promise<void>;
  onChanged: (cb: (evt: FoldersChangedEvent) => void) => () => void;
};

type Deps = {
  db: Database.Database;
  clock: ClockPort;
  ids: IdGenerator;
};

export const buildExplorerService = ({ db, clock, ids }: Deps): ExplorerService => {
  const repo = createSqliteFolderRepo(db);
  const emitter = new EventEmitter();

  const listFolders = makeListFolders({ repo });
  const createFolderUc = makeCreateFolder({ repo, clock, ids });
  const renameFolderUc = makeRenameFolder({ repo, clock });
  const deleteFolderUc = makeDeleteFolder({ repo, clock });
  const moveFolderUc = makeMoveFolder({ repo, clock });
  const listAssignments = makeListAssignments({ repo });
  const assignResourceUc = makeAssignResource({ repo, clock });

  const notify = (evt: FoldersChangedEvent): void => {
    emitter.emit("changed", evt);
  };

  return {
    listFolders,
    createFolder: async (input) => {
      const folder = await createFolderUc(input);
      notify({ channelId: folder.channelId });
      return folder;
    },
    renameFolder: async (input) => {
      const before = repo.get({ id: input.id });
      await renameFolderUc(input);
      if (before) notify({ channelId: before.channelId });
    },
    deleteFolder: async (input) => {
      const before = repo.get({ id: input.id });
      await deleteFolderUc(input);
      if (before) notify({ channelId: before.channelId });
    },
    moveFolder: async (input) => {
      const before = repo.get({ id: input.id });
      await moveFolderUc(input);
      if (before) notify({ channelId: before.channelId });
    },
    listAssignments,
    assignResource: async (input) => {
      await assignResourceUc(input);
      notify({ channelId: input.channelId });
    },
    onChanged: (cb) => {
      emitter.on("changed", cb);
      return () => {
        emitter.off("changed", cb);
      };
    },
  };
};
