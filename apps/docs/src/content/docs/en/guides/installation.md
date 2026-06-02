---
title: Installation
description: Install and run CtxFirst.
---

:::caution[Draft]
Page to be completed once distribution binaries are published.
:::

## From source (development)

Prerequisites: Node.js and Yarn (workspaces).

```bash
git clone <repo>
cd ctxfirst
yarn install
yarn dev        # runs the Electron app in dev mode (renderer HMR)
```

Other useful commands:

- `yarn build` — typecheck + bundle (main + preload + renderer).
- `yarn package` — produces a distributable binary (electron-builder).

## Packaged binary

Coming soon.
