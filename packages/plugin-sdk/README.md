# @ctxfirst/plugin-sdk

Type-only SDK for authoring [CtxFirst desktop](https://github.com/CtxFirst/ctxfirst) plugins.

## Install

```bash
npm install --save-dev @ctxfirst/plugin-sdk
```

The package ships **types only** — at runtime, the host injects the API
objects, your plugin just consumes them. No code from this package ends up in
your bundle.

## Layout of a plugin

```
<plugin-id>/
├── manifest.json   # validated by the host against PluginManifest
├── main.js         # optional — CommonJS, runs in the Electron main process
└── renderer.js     # optional — ESM, runs in the renderer alongside the UI
```

The manifest is the only mandatory file. Both `main.js` and `renderer.js` are
optional — a plugin that only contributes artifact types and parsers needs
neither.

## Manifest

```jsonc
{
  "id": "com.acme.gh-issue",
  "name": "GitHub issue importer",
  "version": "0.1.0",
  "author": "ACME",
  "homepage": "https://example.com/ctxfirst-gh-issue",
  "minAppVersion": "0.1.0",
  "main": "main.js",
  "renderer": "renderer.js",
  "permissions": ["network", "secrets", "engine:steps"],
  "networkHosts": ["api.github.com"],
  "contributions": {
    "stepKinds": [{ "id": "gh.fetch-issue", "label": "Fetch GitHub issue" }]
  }
}
```

Notes:

- `id` is a slug `^[a-z0-9][a-z0-9.-]*$`. **It must remain stable across
  versions.** Bumping `version` re-prompts the user for authorization.
- `permissions` is the full requested set. The user accepts/refuses on first
  load through the host's authorization dialog. Permissions can be revoked at
  any time from `Settings → Plugins`.
- `networkHosts` is **mandatory** when `permissions` includes `"network"`.
  Hostname-only (no scheme, no path, no port). Wildcards are not supported.

## Permissions

| Permission        | What it unlocks                                            |
| ----------------- | ---------------------------------------------------------- |
| `fs:read`         | `api.fs.readFile/readBytes/readdir/stat` in `pluginDataDir` |
| `fs:write`        | `api.fs.writeFile/writeBytes/mkdir/remove` in `pluginDataDir` |
| `secrets`         | `api.secrets.get/set/delete`, scoped per plugin            |
| `engine:read`     | `api.engine.*` (read-only access to instances/timelines)   |
| `engine:steps`    | `api.registerStepRunner` (your runners run with full privileges) |
| `network`         | `api.net.fetch` to hosts in `networkHosts`                 |
| `notifications`   | `api.notifications.notify` (rate-limited)                  |
| `engine:llm`      | reserved (LLM invocation API not yet shipped)              |
| `protocol`        | reserved (`ctxfirst://` deep links — not yet shipped)          |
| `http-server`     | reserved (localhost HTTP server — not yet shipped)         |
| `db:read`/`db:write` | reserved (SQLite access — not yet shipped)              |

## Main half — `main.js`

```js
// CommonJS for now (ESM support arrives with the bundler story).
const { defineMain } = require("@ctxfirst/plugin-sdk/main");

module.exports = defineMain({
  async onload(api) {
    api.log.info("loaded — pluginDataDir =", api.pluginDataDir);

    // Save an encrypted secret (requires "secrets")
    if (api.secrets) {
      await api.secrets.set("token", process.env.GH_TOKEN ?? "");
    }

    // Register an IPC method invokable from the renderer half via
    // `ui.invoke("fetch-issue", { repo, number })`.
    api.registerIpcHandler("fetch-issue", async (raw) => {
      const args = raw;
      if (!api.net) throw new Error("network permission revoked");
      const res = await api.net.fetch(
        `https://api.github.com/repos/${args.repo}/issues/${args.number}`,
        { headers: { authorization: `Bearer ${await api.secrets.get("token")}` } },
      );
      return res.json();
    });
  },

  async onunload(api) {
    api.log.info("unloading");
  },
});
```

### Step runners

Register a custom step kind with `api.registerStepRunner({ … })`. The runner
sees its inputs already validated against the schemas declared in your
contributed artifact types, and produces one or more artifacts via
`ctx.deps.artifactStore.put`. See `apps/desktop/plugins-builtin/hello-world/`
for a minimal reference.

## Renderer half — `renderer.js`

```js
// ESM, no JSX, no `import "react"` — use ui.react.h.
import { defineRenderer } from "@ctxfirst/plugin-sdk/renderer";

export default defineRenderer({
  async onload(ui) {
    const Page = () =>
      ui.react.h(
        "div",
        { className: "p-4 text-sm" },
        ui.react.h(ui.react.icons.Github, { className: "size-4" }),
        " GitHub issue importer is alive.",
      );

    ui.addPage({
      id: "main",
      title: "GitHub",
      icon: ui.react.icons.Github,
      sidebar: Page(),
    });
  },
});
```

`ui.invoke("method", args)` round-trips to the matching `registerIpcHandler`
in your `main.js`. The routing is automatic — `pluginId` is bound at API
construction, you cannot impersonate another plugin.

## Permissions, hot

Revoking a permission from `Settings → Plugins` takes effect immediately.
The next gated call on `api.fs`, `api.net`, etc. throws a
`PluginPermissionError`. Plugins should treat permission losses defensively —
the SDK does not generate retry boilerplate for you.

## Versioning

The SDK ships major versions in lock-step with the host's manifest schema:
- `0.x` — Phase 3 surface (this version).
- A new major version means the host has introduced a breaking manifest or
  API change. Use the major to gate features inside your plugin if you need
  to support multiple host versions.

## Plugin distribution

There is no marketplace yet. To distribute a plugin:

1. Zip your plugin's directory (including `manifest.json`, `main.js`,
   `renderer.js`, any `schemas/`, etc.).
2. Users unzip it under `<userData>/plugins/<plugin-id>/` and restart the app.
3. On boot, the host shows your plugin as `pending` in `Settings → Plugins`;
   the user accepts the requested permissions, and the plugin activates.
