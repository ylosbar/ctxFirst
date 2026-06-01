import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { WfEngine } from "../wf/composition-root";
import {
  registerArtifactTools,
  registerNodeSpecTools,
  registerRunTools,
  registerSkillTools,
  registerTemplateTools,
} from "./tools";

const DEFAULT_PORT = 41234;
const BIND_HOST = "127.0.0.1";
const ENDPOINT = "/mcp";

let httpServer: http.Server | null = null;
/** Last known lifecycle state, surfaced to the renderer via `mcp:getStatus`. */
let serverUrl: string | null = null;
let serverError: string | null = null;

const buildMcpServer = (engine: WfEngine): McpServer => {
  const server = new McpServer({
    name: "ctxfirst-templates",
    version: "0.1.0",
  });
  registerTemplateTools(server, engine);
  registerNodeSpecTools(server, engine);
  registerSkillTools(server, engine);
  registerArtifactTools(server, engine);
  registerRunTools(server, engine);
  return server;
};

const readJsonBody = (req: http.IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });

const handleMcpRequest = async (
  engine: WfEngine,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> => {
  // New server + transport per request (stateless mode) — avoids request-id
  // collisions when multiple clients hit the endpoint concurrently.
  const server = buildMcpServer(engine);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);

  const body = req.method === "POST" ? await readJsonBody(req) : undefined;
  await transport.handleRequest(req, res, body);
};

export type McpServerHandle = { url: string; port: number };

export const startMcpServer = ({
  engine,
  port = DEFAULT_PORT,
}: {
  engine: WfEngine;
  port?: number;
}): Promise<McpServerHandle> =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Only the /mcp endpoint is exposed; method validation is delegated to
      // the Streamable HTTP transport (POST / GET / DELETE).
      const url = req.url ?? "";
      if (!url.startsWith(ENDPOINT)) {
        res.statusCode = 404;
        res.end();
        return;
      }
      handleMcpRequest(engine, req, res).catch((err) => {
        console.error("[mcp] request handler failed:", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end();
        }
      });
    });

    server.once("error", (err) => {
      serverError = err instanceof Error ? err.message : String(err);
      reject(err);
    });
    server.listen(port, BIND_HOST, () => {
      httpServer = server;
      serverUrl = `http://${BIND_HOST}:${port}${ENDPOINT}`;
      serverError = null;
      resolve({ url: serverUrl, port });
    });
  });

export const stopMcpServer = (): Promise<void> =>
  new Promise((resolve) => {
    if (!httpServer) {
      resolve();
      return;
    }
    httpServer.close(() => {
      httpServer = null;
      serverUrl = null;
      resolve();
    });
  });

/** Snapshot du cycle de vie du serveur MCP, consommé par le panneau Settings. */
export type McpServerStatus = {
  /** `true` si le serveur HTTP écoute effectivement. */
  running: boolean;
  /** Endpoint exposé quand le serveur tourne, sinon `null`. */
  url: string | null;
  /** Message de la dernière erreur de démarrage, sinon `null`. */
  error: string | null;
};

export const getMcpServerStatus = (): McpServerStatus => {
  // `httpServer.listening` is the ground truth — the server lives in this very
  // process, so no health-check round-trip is needed.
  const running = httpServer !== null && httpServer.listening;
  return {
    running,
    url: running ? serverUrl : null,
    error: running ? null : serverError,
  };
};
