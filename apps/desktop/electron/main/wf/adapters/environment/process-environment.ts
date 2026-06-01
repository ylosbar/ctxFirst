import type { EnvironmentPort } from "../../application/ports/outbound/environment";

/**
 * Default {@link EnvironmentPort} backed by `process.env`. Plugins should
 * never read `process.env` themselves: they receive a pre-filtered dictionary
 * through this port.
 */
export const createProcessEnvironment = (): EnvironmentPort => ({
  read(keys) {
    const out: Record<string, string> = {};
    for (const key of keys) {
      const v = process.env[key];
      if (typeof v === "string") out[key] = v;
    }
    return out;
  },
});
