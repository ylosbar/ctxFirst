// undici 8.x (bundled by @earendil-works/pi-coding-agent) calls
// `worker_threads.markAsUncloneable` at import time. It only landed in Node
// 22.x; Electron 34 ships Node 20.19, where it's undefined and undici then
// crashes the first time it instantiates a FormData/Request/Response. The
// hint only matters when posting these objects between workers, which we
// don't do — a no-op is safe.
import workerThreads from "node:worker_threads";
if (typeof workerThreads.markAsUncloneable !== "function") {
  (
    workerThreads as { markAsUncloneable?: (value: unknown) => void }
  ).markAsUncloneable = () => {};
}

// Initialize Sentry as early as possible so import-time crashes get reported.
import { initSentry } from "./sentry";
initSentry();

import path from "node:path";
import { mkdirSync } from "node:fs";
import { app, BrowserWindow, Menu, protocol, session, shell } from "electron";
import { is } from "@electron-toolkit/utils";
import installExtension, {
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";
import { registerSettingsHandlers } from "./ipc/settings";
import { registerMaintenanceHandlers } from "./ipc/maintenance";
import { registerSystemHandlers } from "./ipc/system";
import { registerDevLogHandlers } from "./ipc/devlog";
import { registerShellHandlers } from "./ipc/shell";
import { registerWfHandlers } from "./ipc/wf";
import { registerExplorerHandlers } from "./ipc/explorer";
import { registerChatHandlers } from "./ipc/chat";
import { installProductionCsp } from "./csp";
import { openDatabase, closeDatabase } from "./db";
import {
  createSettingsStore,
  migrateOpenRouterPluginSecrets,
} from "./settings/store";
import { buildWfEngine, type WfEngine } from "./wf/composition-root";
import { buildChatService } from "./chat/composition-root";
import type { ChatService } from "./chat/chat-service";
import { buildExplorerService } from "./explorer/composition-root";
import { createSystemClock } from "./wf/adapters/clock/system-clock";
import { createCryptoIdGenerator } from "./wf/adapters/id-generator/crypto-uuid";
import { parseValidationMode } from "./wf/application/artifact-io";
import { startMcpServer, stopMcpServer } from "./mcp/server";
import { createMcpToolProvider } from "./mcp/tools";
import { registerMcpHandlers } from "./ipc/mcp";
import { loadPlugins, unloadAllPlugins } from "./plugins/loader";
import { createPluginRegistry, type PluginRegistry } from "./plugins/registry";
import { createGrantStore } from "./plugins/grants";
import { createSqliteSecretsBackend } from "./plugins/secrets-backend";
import { registerPluginHandlers } from "./ipc/plugins";
import {
  PLUGIN_PROTOCOL_PRIVILEGES,
  registerPluginProtocol,
} from "./plugins/protocol";

// `plugin://` must be declared privileged *before* `app.whenReady`. Setting
// `standard: true` lets the renderer `import()` plugin bundles as ES modules
// matched by the `script-src plugin:` CSP directive (see index.html).
protocol.registerSchemesAsPrivileged([PLUGIN_PROTOCOL_PRIVILEGES]);

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 2736,
    height: 1536,
    title: "CtxFirst",
    show: false,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  // Silence the harmless "Autofill.enable / Autofill.setAddresses wasn't found"
  // errors emitted by the Chromium DevTools frontend — Electron doesn't
  // implement the Autofill CDP domain, so the frontend's auto-enable call fails.
  mainWindow.webContents.on("devtools-opened", () => {
    const dev = mainWindow.webContents.devToolsWebContents;
    if (!dev) return;
    dev
      .executeJavaScript(
        `(() => {
        const orig = console.error;
        console.error = (...args) => {
          const s = String(args[0] ?? "");
          if (s.includes("Autofill.enable") || s.includes("Autofill.setAddresses")) return;
          return orig.apply(console, args);
        };
      })();`,
      )
      .catch(() => {});
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
};

let wfEngine: WfEngine | null = null;
let chatService: ChatService | null = null;
let pluginRegistry: PluginRegistry | null = null;

// Raise Chromium's compositor tile-memory budget. The template editor graph
// (React Flow) zoomed out shows many backdrop-blur nodes at once, each a
// separate GPU layer re-rasterized while panning — the default budget
// overflows and logs "tile memory limits exceeded, some content may not draw".
// This keeps the UI unchanged; it just gives the GPU process more headroom.
app.commandLine.appendSwitch("force-gpu-mem-available-mb", "1024");

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // Harden the CSP for packaged builds — drops `'unsafe-inline'` /
  // `'unsafe-eval'` that the dev CSP in index.html needs for Vite HMR.
  if (!is.dev) {
    installProductionCsp(session.defaultSession);
  }

  if (is.dev) {
    try {
      const ext = await installExtension(REACT_DEVELOPER_TOOLS, {
        loadExtensionOptions: { allowFileAccess: true },
      });
      console.log(`React DevTools installed: ${ext.name}`);
    } catch (err) {
      console.warn("React DevTools install failed:", err);
    }
  }

  const db = openDatabase();

  const settings = createSettingsStore({ db });
  // One-shot: lift any pre-existing OpenRouter plugin secret into core
  // storage. Runs before the engine builds so the runner sees the keys.
  migrateOpenRouterPluginSecrets(db, settings);
  registerSettingsHandlers(settings);
  registerMaintenanceHandlers(db);

  // Managed root for `git.clone` checkouts. Created up-front so the runner can
  // use it as the default `baseDir` (the clone's cwd must already exist).
  const clonesDir = path.join(app.getPath("userData"), "clones");
  mkdirSync(clonesDir, { recursive: true });

  wfEngine = await buildWfEngine({
    db,
    artifactsDir: path.join(app.getPath("userData"), "artifacts"),
    channelIconsDir: path.join(app.getPath("userData"), "channel-icons"),
    getLinearApiKey: () => settings.getLinearApiKey(),
    getOpenRouterApiKey: () => settings.getOpenRouterApiKey(),
    getOpenRouterDefaultModel: () => settings.getOpenRouterDefaultModel(),
    getGitLabAccessToken: () => settings.getGitLabAccessToken(),
    clonesDir,
    artifactValidationMode: parseValidationMode(
      process.env.WF_ARTIFACT_VALIDATION,
    ),
    getAppVersion: () => app.getVersion(),
    channelSettings: {
      read: () => settings.getActiveChannelId(),
      write: (id) => settings.setActiveChannelId(id),
    },
  });

  // Chat global piloté par Pi. Construit en parallèle du moteur de workflow ;
  // ses dépendances sont disjointes (DB + settings store) — pas de partage de
  // bus ni d'état. Pi vit dans le main process et écrit ses sessions sous
  // `<userData>/pi-sessions/`.
  chatService = await buildChatService({
    db,
    sessionsDir: path.join(app.getPath("userData"), "pi-sessions"),
    piCwd: path.join(app.getPath("userData"), "pi-cwd"),
    getOpenRouterApiKey: async () => settings.getOpenRouterApiKey(),
    // Phase B : provider des tools locaux pour les `customTools` de Pi.
    // Délègue à `invokeMcpTool` in-process (pas de transport HTTP) — même
    // code path que le playground.
    toolProvider: createMcpToolProvider(wfEngine),
    // Lu seulement à `createSession` — le snapshot persisté dans la table
    // `chat_sessions.system_prompt` est la source de vérité au resume.
    getChatSystemPrompt: () => settings.getChatSystemPrompt(),
  });

  // Plugins are loaded *after* the engine is built so their contributions can
  // be threaded into the engine's registries. The orchestrator resolves
  // runners lazily at step-start time, so post-boot registration is safe.
  pluginRegistry = createPluginRegistry();
  const grants = createGrantStore({ db });
  const secretsBackend = createSqliteSecretsBackend({ db });
  const pluginSources = [
    {
      dir: path.join(app.getAppPath(), "plugins-builtin"),
      source: "builtin" as const,
    },
    {
      dir: path.join(app.getPath("userData"), "plugins"),
      source: "user" as const,
    },
  ];
  const pluginDataDirFor = (pluginId: string) =>
    path.join(app.getPath("userData"), "plugins-data", pluginId);
  // Read-only engine surface forwarded to plugins with `engine:read`.
  const engineRead = {
    listInstances: () => wfEngine!.listInstances(),
    getTimeline: (instanceId: string) =>
      wfEngine!.getInstanceTimeline(instanceId as never),
    getArtifact: async (artifactId: string) => {
      const got = await wfEngine!.artifactStore.get(artifactId as never);
      return { meta: got.meta, content: got.content };
    },
    listTemplates: () => wfEngine!.listTemplates(),
    listSkills: () => wfEngine!.listSkills(),
  };
  await loadPlugins(pluginSources, {
    registry: pluginRegistry,
    runners: wfEngine.runners,
    appVersion: app.getVersion(),
    pluginDataDirFor,
    grants,
    engineRead,
    secretsBackend,
    artifactSchemas: wfEngine.artifactSchemas,
    parsers: wfEngine.parsers,
    stepKindSuggestions: wfEngine.stepKindSuggestions,
  });
  // Core plugins publish kinds referenced by legacy templates / on-disk
  // artifacts; a missing or failed core plugin leaves the engine unable to
  // resolve those kinds and surfaces later as opaque `UnknownArtifactKindError`s.
  // Fail fast — boot is interactive, the user can read the message and reload.
  for (const p of pluginRegistry.list()) {
    if (p.manifest.core !== true || p.source !== "builtin") continue;
    if (p.state === "active") continue;
    throw new Error(
      `[plugins] core plugin "${p.manifest.id}" failed to activate (state=${p.state})${
        p.error ? `: ${p.error}` : ""
      }`,
    );
  }
  registerPluginHandlers({
    registry: pluginRegistry,
    grants,
    runners: wfEngine.runners,
    sources: pluginSources,
    pluginDataDirFor,
    appVersion: app.getVersion(),
    engineRead,
    secretsBackend,
    artifactSchemas: wfEngine.artifactSchemas,
    parsers: wfEngine.parsers,
    stepKindSuggestions: wfEngine.stepKindSuggestions,
  });
  // Built-in seed validation runs here (not inside `buildWfEngine`) so that
  // seeds are allowed to reference plugin-contributed step kinds — the
  // runners are only in the registry after `loadPlugins` resolves.
  wfEngine.validateSeeds();
  // Same reason for the scheduler: a schedule may pin a template that uses a
  // plugin-contributed step kind. `start()` also runs the catch-up pass —
  // we await it so any rattrapage run is fired before the window opens.
  await wfEngine.scheduler.start();

  // After the plugin registry is populated, install the `plugin://` handler
  // on the default session so the renderer can dynamically import bundles.
  // Registering after `loadPlugins` (rather than before) means the registry
  // already knows every plugin root by the time the renderer fetches one.
  registerPluginProtocol(session.defaultSession, pluginRegistry);

  registerShellHandlers();

  const explorerService = buildExplorerService({
    db,
    clock: createSystemClock(),
    ids: createCryptoIdGenerator(),
  });

  const win = createWindow();
  registerWfHandlers(win, wfEngine);
  registerExplorerHandlers(win, explorerService);
  registerSystemHandlers(win);
  registerDevLogHandlers(win);
  registerChatHandlers(win, chatService);

  registerMcpHandlers(wfEngine);
  startMcpServer({ engine: wfEngine })
    .then((handle) => {
      console.log(`[mcp] server listening on ${handle.url}`);
    })
    .catch((err) => {
      console.error("[mcp] failed to start:", err);
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  void stopMcpServer();
  if (pluginRegistry) void unloadAllPlugins(pluginRegistry);
  if (chatService) void chatService.shutdown();
  wfEngine?.stop();
  closeDatabase();
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, navigationUrl) => {
    const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
    if (rendererUrl && navigationUrl.startsWith(rendererUrl)) return;
    if (navigationUrl.startsWith("file://")) return;
    event.preventDefault();
  });
});
