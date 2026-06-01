/**
 * Outbound port for structured logging. Keeps the application/orchestrator/
 * plugins free of direct `console.*` calls so logs can be redirected to a
 * file, an OS journal, or silenced in tests.
 *
 * Levels follow the standard hierarchy `debug < info < warn < error`.
 */
export interface LoggerPort {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}
