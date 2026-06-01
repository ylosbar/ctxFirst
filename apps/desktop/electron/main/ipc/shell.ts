/**
 * IPC handlers exposing safe shell-level integrations to the renderer.
 *
 *  - `open_external` — validates the URL is http(s) and forwards to
 *    `shell.openExternal`. The renderer is sandboxed and cannot call
 *    `shell.openExternal` itself; this is the single entrypoint.
 *
 * Lives under `electron/main/ipc/` per ARCHITECTURE.md — one file per feature.
 */
import { ipcMain, shell } from "electron";

export const registerShellHandlers = (): void => {
  ipcMain.handle("open_external", async (_event, { url }: { url: string }) => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Only http(s) URLs are allowed");
    }
    await shell.openExternal(url);
  });

  console.log("[shell:ipc] handlers registered");
};
