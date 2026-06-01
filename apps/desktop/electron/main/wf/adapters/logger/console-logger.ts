import type { LoggerPort } from "../../application/ports/outbound/logger";

/**
 * Default {@link LoggerPort} implementation: forwards each level to the
 * matching `console.*` method. The only place in `wf/` where `console` is
 * touched directly.
 */
export const createConsoleLogger = (): LoggerPort => ({
  debug(msg: string): void {
    // eslint-disable-next-line no-console
    console.debug(msg);
  },
  info(msg: string): void {
    // eslint-disable-next-line no-console
    console.log(msg);
  },
  warn(msg: string): void {
     
    console.warn(msg);
  },
  error(msg: string): void {
     
    console.error(msg);
  },
});
