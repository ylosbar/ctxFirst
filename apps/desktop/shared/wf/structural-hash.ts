/**
 * Cross-runtime pieces of the §5 structural-hash machinery — the bits that
 * both the main process (Node) and the renderer (browser-context Electron)
 * need to share so a hash computed on either side compares equal byte-for-byte.
 *
 * The main-process module (`electron/main/wf/domain/artifact-schema-hash.ts`)
 * re-exports {@link canonicalJson}, {@link STRUCTURAL_HASH_SHORT_LEN} and
 * {@link truncateStructuralHash} from here, then adds its own *synchronous*
 * hash entrypoint built on `node:crypto`. The renderer cannot use `node:crypto`,
 * so it uses {@link computeStructuralHashAsync}, which goes through Web Crypto
 * — same canonical bytes, same digest, same hex.
 */

/**
 * Short fingerprint length (hex chars) exposed in the `record:<hash>` kind
 * encoding and in UI tooltips. 16 hex = 64 bits — collision probability is
 * negligible at any plausible workspace scale, and the long form (full SHA-256)
 * remains addressable via the same prefix lookup.
 */
export const STRUCTURAL_HASH_SHORT_LEN = 16;

/**
 * Deterministic JSON serialisation: object keys are sorted recursively, no
 * whitespace, and primitives are serialised via `JSON.stringify` (so `1` and
 * `1.0` collapse to the same byte sequence). Arrays preserve their order
 * (semantic), and `undefined` values inside an object skip that key — matches
 * `JSON.stringify` semantics so callers don't need a parallel mental model.
 */
export const canonicalJson = (value: unknown): string => {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k]))
      .join(",") +
    "}"
  );
};

/** Returns the short, user-facing prefix of a structural hash. */
export const truncateStructuralHash = (hash: string): string =>
  hash.slice(0, STRUCTURAL_HASH_SHORT_LEN);

const HEX = "0123456789abcdef";
const bytesToHex = (bytes: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += HEX[b >>> 4] + HEX[b & 0xf];
  }
  return out;
};

/**
 * Web-Crypto SHA-256 of a UTF-8 string, hex-encoded. Resolves to the same hex
 * as `node:crypto`'s `createHash("sha256").update(s).digest("hex")` — that
 * equivalence is what makes the renderer's live hash preview match what the
 * main process will persist on save.
 */
const sha256Hex = async (input: string): Promise<string> => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
};

/**
 * Async mirror of the main-process `computeStructuralHash`. Hashes a leaf
 * descriptor (built-in, user, plugin) from its `simplifiedSchema` and
 * refinement parent. The parent resolver may itself be async — typical
 * caller looks up the parent in a TanStack-cached list that already carries
 * the parent's hash, so the resolver is just a synchronous map lookup wrapped
 * in `Promise.resolve`.
 */
export const computeStructuralHashAsync = async (
  descriptor: { simplifiedSchema: unknown; extends: string | null },
  resolveParentHash: (kind: string) => string | null | Promise<string | null>,
): Promise<string> => {
  const parentHash = descriptor.extends
    ? await resolveParentHash(descriptor.extends)
    : null;
  return sha256Hex(
    canonicalJson({
      schema: descriptor.simplifiedSchema,
      parent: parentHash,
    }),
  );
};
