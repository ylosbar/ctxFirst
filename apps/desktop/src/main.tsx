import * as Sentry from "@sentry/electron/renderer";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootRendererPlugins } from "./plugins/plugin-loader";
import { createElectronPluginGateway } from "./infrastructure/electron/electron-plugin-gateway";

// DSN is configured in the main process (electron/main/sentry.ts); the
// renderer SDK inherits it via Electron IPC and just needs to be enabled.
Sentry.init({});

const container = document.getElementById("root") as HTMLElement;

// Reuse the React root across HMR. Without this, a hot update that bubbles up
// to this entry re-runs `createRoot` on the same container, leaking the
// previous component tree — including its WebGL/canvas contexts (React Flow,
// xterm) — and spamming the "createRoot called twice" warning. Caching the
// root on `import.meta.hot.data` (which survives the module re-evaluation)
// makes the re-render a no-op mount. See specs/electron-memory-dev.md.
const root = import.meta.hot?.data.root ?? ReactDOM.createRoot(container);
if (import.meta.hot) import.meta.hot.data.root = root;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Kick off renderer plugin loading after React has mounted. Fire-and-forget:
// plugins register their contributions asynchronously and will appear once
// their `onload` resolves; failures stay isolated in the loader.
//
// The loader depends on a `PluginGateway` rather than `window.api.plugins`
// directly — the Electron adapter is the only renderer-side file allowed to
// touch `window.api.plugins.*` (ARCHITECTURE.md §4).
//
// Guarded so a hot re-evaluation of this entry doesn't re-boot every plugin
// (which would re-register their contributions on top of the live ones).
if (!import.meta.hot?.data.pluginsBooted) {
  if (import.meta.hot) import.meta.hot.data.pluginsBooted = true;
  void bootRendererPlugins(createElectronPluginGateway());
}

// Self-accept so editing this entry hot-swaps instead of forcing a full page
// reload (which drops renderer state and re-inits Sentry). The handler logs
// the JS heap on each accepted update to confirm whether HMR churn is the
// source of the dev OOM — see specs/electron-memory-dev.md § Mesurer le crash.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    const mem = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    if (mem) {
      const mb = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
      console.info(`[hmr] renderer heap ${mb} MB after accept`);
    }
  });
}
