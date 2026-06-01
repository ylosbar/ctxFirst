/**
 * Sentry initialization for the main (Electron) process.
 *
 * Must be called as early as possible in `electron/main/index.ts` — before
 * the rest of the boot code runs — so that any synchronous crash thrown by
 * the imports below is captured. The renderer initializes Sentry separately
 * from `src/main.tsx` via `@sentry/electron/renderer`.
 *
 * DSN is hard-coded by default (it is a public identifier, not a secret).
 * Override with `SENTRY_DSN` if you want to point a build at a different
 * project. Set `SENTRY_DISABLED=1` to short-circuit entirely (useful for
 * local debug sessions when you don't want noise on the dashboard).
 */
import { app } from "electron";
import { init } from "@sentry/electron/main";

const DEFAULT_DSN =
  "https://b4dabeffc9fbcb2f7e05d3260e4fc88b@o4504894948245504.ingest.us.sentry.io/4511462574456834";

export const initSentry = (): void => {
  if (process.env.SENTRY_DISABLED === "1") return;

  const dsn = process.env.SENTRY_DSN ?? DEFAULT_DSN;
  if (!dsn) return;

  init({
    dsn,
    environment: app.isPackaged ? "production" : "development",
    release: app.getVersion(),
  });
};
