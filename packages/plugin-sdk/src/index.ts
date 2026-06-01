/**
 * Barrel re-export. Plugin authors who want a single import root can use
 * `@ctxfirst/plugin-sdk`; the `main`/`renderer` subpaths exist for tree-shaking
 * and to keep the renderer half free of Node-only types.
 */
export * from "./main";
export * from "./renderer";
