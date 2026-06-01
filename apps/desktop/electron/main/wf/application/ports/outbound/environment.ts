/**
 * Outbound port for reading process environment variables. Keeps plugins
 * and application code free of direct `process.env` access — they receive a
 * pre-filtered dictionary instead, which makes them trivially testable and
 * prevents accidental leakage of unrelated env vars.
 */
export interface EnvironmentPort {
  /**
   * Returns the subset of environment variables matching the given keys.
   * Keys with no value in the host environment are omitted (so callers can
   * distinguish "unset" from "empty string").
   */
  read(keys: ReadonlyArray<string>): Record<string, string>;
}
