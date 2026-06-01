import * as Sentry from "@sentry/electron/renderer";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootRendererPlugins } from "./plugins/plugin-loader";
import { createElectronPluginGateway } from "./infrastructure/electron/electron-plugin-gateway";

// DSN is configured in the main process (electron/main/sentry.ts); the
// renderer SDK inherits it via Electron IPC and just needs to be enabled.
Sentry.init({});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
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
void bootRendererPlugins(createElectronPluginGateway());
