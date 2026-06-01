/**
 * Custom `plugin://` protocol — serves files from `<rootDir>/<relPath>` for a
 * given loaded plugin so the renderer can `import("plugin://<id>/<file>")`
 * its bundle without breaking the CSP (no `file://` script-src, no inline).
 *
 * Resolution rules:
 *  - The URL host segment is the `pluginId`. Must match a currently-loaded
 *    plugin in the registry — otherwise the response is 404. This means
 *    unloading a plugin instantly invalidates further fetches on its scheme.
 *  - The path is resolved against the plugin's `rootDir` with `path.resolve`,
 *    and the result must remain under that root (no `..` exfiltration).
 *  - Only a small allow-list of extensions is served (`.js`, `.mjs`, `.css`,
 *    `.json`, `.map`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.woff`,
 *    `.woff2`). Everything else is 403. Keeps the surface minimal — a plugin
 *    cannot serve arbitrary user files via this scheme.
 *  - `Content-Type` is set from the extension; for `.js`/`.mjs` we emit
 *    `text/javascript` so the renderer's dynamic `import()` accepts the
 *    response as an ES module.
 *
 * The scheme is also registered as **privileged** at app startup (before
 * `app.whenReady()`) so it supports `fetch` / `import()` from the renderer
 * with the right CORS/CSP semantics. The privilege flags are kept as narrow
 * as possible.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { type Session } from "electron";
import type { PluginRegistry } from "./registry";

export const PLUGIN_PROTOCOL_SCHEME = "plugin";

/** Privilege flags applied via `protocol.registerSchemesAsPrivileged`. */
export const PLUGIN_PROTOCOL_PRIVILEGES = {
  scheme: PLUGIN_PROTOCOL_SCHEME,
  privileges: {
    // `standard: true` enables `fetch`/relative-URL resolution and lets the
    // CSP `script-src plugin:` match `import("plugin://...")` from the bundle.
    standard: true,
    // The renderer treats `plugin:` responses as same-origin for the plugin's
    // own URLs — needed for ES modules and stylesheet imports.
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
} as const;

const ALLOWED_EXTS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".map",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".woff",
  ".woff2",
]);

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const respond = (status: number, body: string): Response =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

const ensureUnderRoot = (rootDir: string, relPath: string): string | null => {
  const abs = path.resolve(rootDir, relPath);
  const rootAbs = path.resolve(rootDir);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return null;
  return abs;
};

/**
 * Installs `protocol.handle('plugin', ...)` on the given session. Must be
 * called *after* `app.whenReady()` resolves. Pair with the privilege
 * registration done at module load time (see {@link PLUGIN_PROTOCOL_PRIVILEGES}).
 */
export const registerPluginProtocol = (
  session: Session,
  registry: PluginRegistry,
): void => {
  session.protocol.handle(PLUGIN_PROTOCOL_SCHEME, async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return respond(400, "invalid plugin URL");
    }
    const pluginId = url.hostname;
    if (!pluginId) return respond(400, "missing plugin id");
    const plugin = registry.get(pluginId);
    if (!plugin) return respond(404, `plugin not loaded: ${pluginId}`);
    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!rel) return respond(400, "missing path");
    const abs = ensureUnderRoot(plugin.rootDir, rel);
    if (!abs) {
      return respond(403, `path escapes plugin root: ${rel}`);
    }
    const ext = path.extname(abs).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return respond(403, `extension not allowed: ${ext || "<none>"}`);
    }
    try {
      const data = await fs.readFile(abs);
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
          // Cache-bust on every load so plugin updates take effect immediately
          // in dev — the cost in prod is negligible (a handful of small files).
          "cache-control": "no-store",
        },
      });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return respond(404, `not found: ${rel}`);
      return respond(500, `read error: ${(err as Error).message}`);
    }
  });
};
