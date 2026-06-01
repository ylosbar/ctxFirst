import path from "node:path";
import type { PathPort } from "../../application/ports/outbound/path";

/**
 * Posix-style path port for deterministic tests. Wraps `node:path/posix` so
 * tests behave identically on Linux/macOS/Windows runners.
 */
export const createFakePath = (): PathPort => ({
  resolve: (...segments) => path.posix.resolve(...segments),
  sep: "/",
});
