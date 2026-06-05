/**
 * Periodic memory/CPU sampler that reports `app.getAppMetrics()` to Sentry as
 * custom gauges. Lets us follow the RAM *trend* across a session (which process
 * grows, whether `peakWorkingSetSize` ever comes back down) rather than relying
 * on one-off DevTools snapshots — see specs/electron-memory-dev.md § "En continu".
 *
 * Wired dev-only and behind a user setting (`dev.perfMonitoring`, default on);
 * the Settings page can toggle it live. Gauges are no-ops when Sentry isn't
 * initialized (`SENTRY_DISABLED=1`), so starting the monitor is always safe.
 *
 * `app.getAppMetrics()` reports memory sizes in **kilobytes**. The Sentry SDK
 * buffers metrics and flushes them on its own ~5s cadence — no manual flush.
 */
import { app } from "electron";
import * as Sentry from "@sentry/electron/main";

/** How often to sample. One point every 30s keeps the metric volume modest. */
const SAMPLE_INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;

const sample = (): void => {
  // `getAppMetrics` is only meaningful once the app is ready; the monitor is
  // never started before `whenReady`, but guard defensively anyway.
  if (!app.isReady()) return;

  for (const metric of app.getAppMetrics()) {
    const attributes: Record<string, string | number> = {
      "process.type": metric.type,
      "process.pid": metric.pid,
    };
    const label = metric.name ?? metric.serviceName;
    if (label) attributes["process.name"] = label;

    Sentry.metrics.gauge(
      "app.process.memory.working_set",
      metric.memory.workingSetSize,
      { unit: "kilobyte", attributes },
    );
    Sentry.metrics.gauge(
      "app.process.memory.peak_working_set",
      metric.memory.peakWorkingSetSize,
      { unit: "kilobyte", attributes },
    );
    // `privateBytes` is 0 / absent on some platforms — only report when real.
    if (metric.memory.privateBytes) {
      Sentry.metrics.gauge(
        "app.process.memory.private_bytes",
        metric.memory.privateBytes,
        { unit: "kilobyte", attributes },
      );
    }
    if (metric.cpu) {
      Sentry.metrics.gauge(
        "app.process.cpu",
        metric.cpu.percentCPUUsage,
        { unit: "percent", attributes },
      );
    }
  }
};

/** Idempotent: a second call while already running is a no-op. */
export const startPerfMonitor = (): void => {
  if (timer) return;
  sample();
  timer = setInterval(sample, SAMPLE_INTERVAL_MS);
  // Don't let the sampler hold the event loop open at shutdown.
  timer.unref();
  console.info("[perf-monitor] started (Sentry memory gauges, dev)");
};

/** Idempotent: safe to call when not running. */
export const stopPerfMonitor = (): void => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  console.info("[perf-monitor] stopped");
};

export const isPerfMonitorRunning = (): boolean => timer !== null;
