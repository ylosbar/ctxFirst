import { ipcMain } from "electron";
import { performance } from "node:perf_hooks";
import { getMcpServerStatus } from "../mcp/server";
import { invokeMcpTool, listMcpTools } from "../mcp/tools";
import type { WfEngine } from "../wf/composition-root";

export const registerMcpHandlers = (engine: WfEngine) => {
  ipcMain.handle("mcp:getStatus", async () => getMcpServerStatus());
  ipcMain.handle("mcp:listTools", async () => listMcpTools());
  ipcMain.handle(
    "mcp:invokeTool",
    async (
      _event,
      req: { name: string; args: Record<string, unknown> },
    ) => {
      const start = performance.now();
      try {
        const { text } = await invokeMcpTool(engine, req.name, req.args);
        return { ok: true, text, durationMs: performance.now() - start };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          durationMs: performance.now() - start,
        };
      }
    },
  );

  console.log("[mcp:ipc] handlers registered");
};
