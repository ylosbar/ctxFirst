import type { LoggerPort } from "../../application/ports/outbound/logger";

export type FakeLogger = LoggerPort & {
  readonly logs: ReadonlyArray<{ level: "debug" | "info" | "warn" | "error"; msg: string }>;
  reset(): void;
};

export const createFakeLogger = (): FakeLogger => {
  const logs: { level: "debug" | "info" | "warn" | "error"; msg: string }[] = [];

  return {
    debug(msg) {
      logs.push({ level: "debug", msg });
    },
    info(msg) {
      logs.push({ level: "info", msg });
    },
    warn(msg) {
      logs.push({ level: "warn", msg });
    },
    error(msg) {
      logs.push({ level: "error", msg });
    },
    get logs() {
      return logs;
    },
    reset() {
      logs.length = 0;
    },
  };
};

/** Logger that drops every message. Use when assertions on logs are not needed. */
export const createSilentLogger = (): LoggerPort => ({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});
