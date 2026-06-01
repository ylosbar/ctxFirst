import { createHash } from "node:crypto";
import type { HashPort } from "../../application/ports/outbound/hash";

/**
 * Default {@link HashPort} backed by Node's `crypto` module. The only place
 * in `wf/` that imports `node:crypto`.
 */
export const createNodeHash = (): HashPort => ({
  sha256(parts: ReadonlyArray<string>): string {
    const h = createHash("sha256");
    for (const p of parts) h.update(p);
    return h.digest("hex");
  },
});
