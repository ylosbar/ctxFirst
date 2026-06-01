## Quick start

Prerequisites: Node + yarn, `claude` CLI installed and authenticated (the app spawns `claude -p --output-format stream-json`).

```bash
yarn install     # installs + rebuilds better-sqlite3 for Electron
yarn dev         # launches the app (renderer HMR)
yarn build       # production bundle
```

## License

CtxFirst is **dual-licensed**:

- The desktop application is open source under the
  [GNU AGPL-3.0-or-later](LICENSE). Modifications distributed or run as a
  network service must be shared under the same license.
- The [`@ctxfirst/plugin-sdk`](packages/plugin-sdk/) package is
  [MIT-licensed](packages/plugin-sdk/LICENSE), so you can build and ship
  **proprietary, closed-source plugins** without any further obligation.
- A **commercial license** is available for closed-source or hosted use that
  the AGPL does not permit — see [COMMERCIAL.md](COMMERCIAL.md).

Contributions are accepted under the [DCO](CONTRIBUTING.md).