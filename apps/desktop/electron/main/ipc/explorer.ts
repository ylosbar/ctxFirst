import { ipcMain, type BrowserWindow } from "electron";
import type { ExplorerService } from "../explorer/composition-root";
import type { ResourceKind } from "../explorer/domain/folder";

type ListArgs = { channelId: string };
type CreateArgs = {
  channelId: string;
  parentId: string | null;
  name: string;
};
type RenameArgs = { id: string; name: string };
type DeleteArgs = { id: string; strategy?: "detach-items" | "cascade" };
type MoveArgs = { id: string; parentId: string | null };
type AssignArgs = {
  channelId: string;
  kind: ResourceKind;
  resourceId: string;
  folderId: string | null;
};

/* eslint-disable no-console */
const short = (s: string, n = 8) => s.slice(0, n);

export const registerExplorerHandlers = (
  win: BrowserWindow,
  svc: ExplorerService,
): void => {
  ipcMain.handle("wf:folders:list", async (_e, args: ListArgs) =>
    svc.listFolders(args),
  );
  ipcMain.handle("wf:folders:create", async (_e, args: CreateArgs) => {
    try {
      return await svc.createFolder(args);
    } catch (err) {
      console.error(
        `[explorer:ipc] create channel=${args.channelId} parent=${args.parentId ?? "<root>"} failed:`,
        err,
      );
      throw err;
    }
  });
  ipcMain.handle("wf:folders:rename", async (_e, args: RenameArgs) => {
    try {
      await svc.renameFolder(args);
    } catch (err) {
      console.error(`[explorer:ipc] rename id=${short(args.id)} failed:`, err);
      throw err;
    }
  });
  ipcMain.handle("wf:folders:delete", async (_e, args: DeleteArgs) => {
    try {
      await svc.deleteFolder(args);
    } catch (err) {
      console.error(`[explorer:ipc] delete id=${short(args.id)} failed:`, err);
      throw err;
    }
  });
  ipcMain.handle("wf:folders:move", async (_e, args: MoveArgs) => {
    try {
      await svc.moveFolder(args);
    } catch (err) {
      console.error(`[explorer:ipc] move id=${short(args.id)} failed:`, err);
      throw err;
    }
  });
  ipcMain.handle("wf:folders:listItems", async (_e, args: ListArgs) =>
    svc.listAssignments(args),
  );
  ipcMain.handle("wf:folders:assign", async (_e, args: AssignArgs) => {
    try {
      await svc.assignResource(args);
    } catch (err) {
      console.error(
        `[explorer:ipc] assign resource=${short(args.resourceId)} folder=${args.folderId ?? "<root>"} failed:`,
        err,
      );
      throw err;
    }
  });

  svc.onChanged((evt) => {
    if (win.isDestroyed()) return;
    win.webContents.send("wf:folders:changed", evt);
  });

  console.log("[explorer:ipc] handlers registered");
};
