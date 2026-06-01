/**
 * IPC handlers for generic OS-level interactions that are not workflow-
 * specific: native pickers and the save-text dialog.
 *
 * Lives under `electron/main/ipc/` per ARCHITECTURE.md — one file per feature.
 */
import { readFile, writeFile } from "node:fs/promises";
import { type BrowserWindow, dialog, ipcMain } from "electron";

type FileFilter = { name: string; extensions: ReadonlyArray<string> };

export const registerSystemHandlers = (win: BrowserWindow): void => {
  ipcMain.handle(
    "system:pickDirectory",
    async (
      _e,
      args?: { defaultPath?: string; title?: string },
    ): Promise<string | null> => {
      const res = await dialog.showOpenDialog(win, {
        properties: ["openDirectory"],
        defaultPath: args?.defaultPath,
        title: args?.title ?? "Choisir un répertoire",
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      return res.filePaths[0];
    },
  );

  ipcMain.handle(
    "system:pickFile",
    async (
      _e,
      args?: {
        defaultPath?: string;
        title?: string;
        filters?: ReadonlyArray<FileFilter>;
      },
    ): Promise<string | null> => {
      const res = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        defaultPath: args?.defaultPath,
        title: args?.title ?? "Choisir un fichier",
        filters: args?.filters as Electron.FileFilter[] | undefined,
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      return res.filePaths[0];
    },
  );

  ipcMain.handle(
    "system:pickAndReadTextFile",
    async (
      _e,
      args?: {
        defaultPath?: string;
        title?: string;
        filters?: ReadonlyArray<FileFilter>;
      },
    ): Promise<{ path: string; content: string } | null> => {
      const res = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        defaultPath: args?.defaultPath,
        title: args?.title ?? "Choisir un fichier",
        filters: args?.filters as Electron.FileFilter[] | undefined,
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      const path = res.filePaths[0];
      const content = await readFile(path, "utf8");
      return { path, content };
    },
  );

  ipcMain.handle(
    "system:saveTextFile",
    async (
      _e,
      args: {
        content: string;
        defaultFileName?: string;
        title?: string;
        filters?: ReadonlyArray<FileFilter>;
      },
    ): Promise<string | null> => {
      const res = await dialog.showSaveDialog(win, {
        defaultPath: args.defaultFileName,
        title: args.title ?? "Enregistrer le fichier",
        filters: args.filters as Electron.FileFilter[] | undefined,
      });
      if (res.canceled || !res.filePath) return null;
      await writeFile(res.filePath, args.content, "utf8");
      return res.filePath;
    },
  );

  ipcMain.handle(
    "system:saveBinaryFile",
    async (
      _e,
      args: {
        content: Uint8Array | ArrayBuffer;
        defaultFileName?: string;
        title?: string;
        filters?: ReadonlyArray<FileFilter>;
      },
    ): Promise<string | null> => {
      const res = await dialog.showSaveDialog(win, {
        defaultPath: args.defaultFileName,
        title: args.title ?? "Enregistrer le fichier",
        filters: args.filters as Electron.FileFilter[] | undefined,
      });
      if (res.canceled || !res.filePath) return null;
      const buf = Buffer.from(
        args.content instanceof ArrayBuffer
          ? new Uint8Array(args.content)
          : args.content,
      );
      await writeFile(res.filePath, buf);
      return res.filePath;
    },
  );

  // Window controls — the BrowserWindow is frameless+transparent so the
  // renderer paints its own min/max/close buttons and routes the action back
  // here. `system:window:isMaximized` returns the *current* state so the UI
  // can boot with the right icon; the `system:window:maximizedChange` channel
  // streams subsequent transitions (including those triggered by the WM, e.g.
  // a double-click on the drag region or a Super+Up shortcut).
  ipcMain.handle("system:window:minimize", () => {
    win.minimize();
  });
  ipcMain.handle("system:window:maximizeToggle", () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle("system:window:close", () => {
    win.close();
  });
  ipcMain.handle("system:window:isMaximized", () => win.isMaximized());

  const emitMaximized = (value: boolean) => {
    if (!win.isDestroyed())
      win.webContents.send("system:window:maximizedChange", value);
  };
  win.on("maximize", () => emitMaximized(true));
  win.on("unmaximize", () => emitMaximized(false));

  console.log("[system:ipc] handlers registered");
};
