/**
 * Production Content-Security-Policy override.
 *
 * The CSP declared inline in `index.html` is dev-friendly: it keeps
 * `'unsafe-inline'` / `'unsafe-eval'` and `http://localhost:*` so that Vite
 * HMR keeps working in `yarn dev`. For packaged builds we drop those
 * relaxations by intercepting `onHeadersReceived` on the default session and
 * rewriting `Content-Security-Policy` to a hardened policy.
 *
 * Origins that the renderer is allowed to talk to (remote backend, CDN, …)
 * MUST be added here when introduced; the dev CSP must mirror them under
 * `connect-src` in `index.html`.
 */
import { type Session } from "electron";

const PROD_CSP = [
  "default-src 'self' file:",
  "script-src 'self' file: plugin:",
  "style-src 'self' file: 'unsafe-inline' plugin:",
  "img-src 'self' file: data: blob: plugin:",
  "font-src 'self' file: data: plugin:",
  // Tight allow-list. Add backend origins here (e.g. https://api.example.com)
  // when the multirepo backend lands — never use a bare `https:`.
  // `openrouter.ai` is required so the future renderer-side chat session
  // status panel can reach it for the `/test-connection` flow; Pi /
  // `openrouter.invoke` themselves run in the main process and bypass the CSP.
  "connect-src 'self' https://openrouter.ai https://*.ingest.us.sentry.io plugin:",
].join("; ");

export const installProductionCsp = (session: Session): void => {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [PROD_CSP],
      },
    });
  });
  console.log("[csp] hardened production CSP installed");
};
