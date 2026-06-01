import { createHash } from "node:crypto";
import type { HashPort } from "../../application/ports/outbound/hash";

/**
 * Real SHA-256 — but kept as a "fake" alias for test readability. The crypto
 * module is fast and deterministic; mocking it adds no value.
 */
export const createFakeHash = (): HashPort => ({
  sha256(parts) {
    const h = createHash("sha256");
    for (const p of parts) h.update(p, "utf8");
    return h.digest("hex");
  },
});
