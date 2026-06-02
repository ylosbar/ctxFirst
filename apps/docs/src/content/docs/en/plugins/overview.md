---
title: Plugin system
description: Architecture of the CtxFirst plugin system — the two halves, the manifest, permissions, and how plugins plug into the engine.
sidebar:
  order: 1
---

CtxFirst is extensible through **plugins**. A plugin can add new **nodes** (step
kinds) to workflows, publish its own **artifact types**, and contribute **pages**
to the UI. The types intended for authors are published in the
`@ctxfirst/plugin-sdk` package (`packages/plugin-sdk/`) — a **types-only**
package: at runtime the host injects the API objects, the plugin just consumes
them.

To build a plugin end to end, see [Create a plugin](/en/plugins/create-a-plugin/).

## Anatomy of a plugin

A plugin is a folder identified by its `id`, holding up to three files:

```
<plugin-id>/
├── manifest.json   # required — validated by the host against PluginManifest
├── main.js         # optional — CommonJS, runs in Electron's main process
└── renderer.js     # optional — ESM, runs in the renderer alongside the UI
```

Only `manifest.json` is required. A plugin that just adds artifact types and
parsers needs neither `main.js` nor `renderer.js`.

Plugins bundled with the app live in `apps/desktop/plugins-builtin/`;
user-installed plugins under `<userData>/plugins/<plugin-id>/`.

## The two halves

Like the app itself, a plugin is split along Electron's security boundary — see
the [desktop architecture](/en/architecture/overview/). Each half has its own
entry point and role:

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  renderer.js  (renderer)    │         │   main.js  (main process)   │
│                             │         │                             │
│  onload(ui)                 │  IPC    │  onload(api)                │
│   • ui.addPage(...)         │ ──────► │   • api.registerStepRunner  │
│   • ui.registerSettingsTab  │ invoke  │   • api.registerIpcHandler  │
│   • ui.invoke("method")     │ ◄────── │   • api.fs / net / secrets  │
│   • ui.react.h(...)         │ result  │   • api.engine / log        │
└─────────────────────────────┘         └─────────────────────────────┘
        UI, no Node access            native access, runs the nodes
```

- **The main half** (`main.js`, CommonJS) runs in Electron's privileged Node.js
  process. This is where you register **step runners** (the node logic), **IPC
  handlers**, and access the file system, network, or secrets — always filtered
  by the granted permissions. Entry point: `onload(api)` / `onunload(api)`.
- **The renderer half** (`renderer.js`, ESM) runs in the renderer, alongside the
  React UI. It contributes **pages** and **settings tabs**, and calls into the
  main half via `ui.invoke(...)`. Entry point: `onload(ui)` / `onunload(ui)`. It
  has **no Node access** and does not import React directly: you go through
  `ui.react.h` (the host's `createElement`) and `ui.primitives` (shared
  components themed by the app).

IPC routing is automatic: `ui.invoke("method", args)` lands on the
`api.registerIpcHandler("method", …)` of the **same** plugin. The `pluginId` is
bound at API construction time — a plugin cannot impersonate another.

## Manifest and contributions

`manifest.json` describes the plugin's identity, its permissions, and what it
brings to the app:

```jsonc
{
  "id": "com.acme.tweets",      // stable slug ^[a-z0-9][a-z0-9.-]*$
  "name": "Tweet composer",
  "version": "0.1.0",           // bump → re-prompts the user for authorization
  "main": "main.js",
  "renderer": "renderer.js",
  "permissions": ["engine:steps"],
  "contributions": {
    "stepKinds": [
      { "id": "tweet.compose", "label": "Multilingual tweets" }
    ],
    "artifactSchemas": [ /* new artifact kinds (see below) */ ]
  }
}
```

The possible contributions:

| Contribution      | Effect                                                          |
| ----------------- | -------------------------------------------------------------- |
| `stepKinds`       | new **nodes** available in the workflow editor                 |
| `artifactSchemas` | new **artifact types** `plugin:<id>:<Id>@<version>`            |
| `routes`          | reserved                                                       |
| `navItems`        | reserved                                                       |
| `parsers`         | contributed artifact parsers                                   |

An **artifact type** is declared with an `id`, a `version` and a
`simplifiedSchema` (a JSON Schema for the payload). It becomes referenceable
under the full kind `plugin:<plugin-id>:<id>@<version>` — for example the bundled
Linear plugin publishes `plugin:linear:Ticket@v1`.

## Permissions

Permissions are declared in the manifest. On first install the host shows the
list to the user, who **accepts or refuses**. They can be revoked at any time
from `Settings → Plugins`, and revocation is **immediate**: the next gated call
(`api.fs`, `api.net`…) throws. A plugin should treat permission loss
defensively.

| Permission        | What it unlocks                                                  |
| ----------------- | --------------------------------------------------------------- |
| `engine:steps`    | `api.registerStepRunner` — your runners run with the engine's full `RunContext` |
| `engine:read`     | `api.engine.*` — read access to instances, timelines, templates, skills |
| `fs:read`         | `api.fs.readFile/readdir/stat` in `pluginDataDir`               |
| `fs:write`        | `api.fs.writeFile/mkdir/remove` in `pluginDataDir`             |
| `secrets`         | `api.secrets.get/set/delete`, encrypted and scoped per plugin   |
| `network`         | `api.net.fetch` to the hosts declared in `networkHosts`        |
| `notifications`   | `api.notifications.notify`                                       |
| `engine:llm`, `protocol`, `http-server`, `db:read`, `db:write` | accepted by the manifest but **not yet implemented** (reserved) |

:::note
`networkHosts` is **mandatory** as soon as `network` is requested (hostname
only, no scheme or port, no wildcards).
:::

## Lifecycle

1. On startup the host scans the plugin folders and validates each manifest.
2. For a user plugin it checks authorization (builtins are auto-approved); a
   not-yet-authorized plugin shows up as `pending` in `Settings → Plugins`.
3. Once active, the host builds a `PluginApi` filtered by the granted
   permissions, then calls `onload(api)` (main) and `onload(ui)` (renderer).
   This is where the plugin registers its runners, handlers and pages.
4. Contributions (artifact types, parsers) are pushed into the engine registries
   and become available to **all** steps.
5. On deactivation or unload, `onunload` is called for cleanup.

## How a plugin node runs

A contributed `stepKind` materializes as a **step runner** registered via
`api.registerStepRunner(runner)`. The engine's orchestrator does not know how to
run a node itself: it resolves the runner by its `kind` from the registry, then:

- calls `runner.resolveSpec(ctx)` to learn the node's **ports** (accepted
  inputs, produced outputs) — which determines how it wires to other nodes in
  the editor;
- calls `runner.run(ctx)` to execute it.

The `ctx` passed to `run` is a `RunContext`: it carries the **inputs** already
resolved from upstream node outputs (`ctx.inputs[]`, each with its `kind`, raw
`content` and parsed `payload`), plus a `ctx.deps` object injected by the engine.
Under `engine:steps`, the runner receives the **same privileged `RunContext`** as
native nodes — notably:

- `ctx.deps.artifactStore.put(kind, content, meta)` — to produce artifacts;
- `ctx.deps.llm.invokeStreaming(...)` — to call the model (like the native Claude Code Invoke node);
- `ctx.deps.linear`, `ctx.deps.shell`, `ctx.deps.clock`, `ctx.deps.ids`, etc.

The runner finishes by returning an outcome: `{ kind: "produced", artifact }` for
a single output, `{ kind: "produced-many", artifacts: [{ port, artifact }] }` for
multiple outputs, or `{ kind: "produced-pending-human", … }` to hand off to a
human validation.

It is this contract — runner + injected `RunContext` — that makes a plugin node
indistinguishable from a native one to the engine. The
[tutorial page](/en/plugins/create-a-plugin/) builds a full one.

## Plugins bundled with the app

Three reference plugins in `apps/desktop/plugins-builtin/`, from simplest to most
complete:

- **hello-world** — minimal: a `hello.echo` step kind that uppercases its
  Markdown input, plus a renderer page that exercises the IPC round-trip.
- **kanban** — UI-only: a Kanban board persisted in `pluginDataDir`
  (`fs:read`/`fs:write` permissions), with no step kind at all.
- **linear** — full: three step kinds (`linear.fetch`, `linear.split`,
  `linear.set-status`) and a `plugin:linear:Ticket@v1` artifact type.

## Distribution

There is no marketplace yet. To distribute a plugin:

1. Zip the plugin folder (`manifest.json`, `main.js`, `renderer.js`, any
   `schemas/`…).
2. The user unzips it under `<userData>/plugins/<plugin-id>/` and restarts the
   app.
3. On boot the plugin shows as `pending` in `Settings → Plugins`; the user
   accepts the requested permissions and the plugin activates.
