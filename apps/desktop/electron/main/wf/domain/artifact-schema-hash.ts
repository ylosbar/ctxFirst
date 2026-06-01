/**
 * Structural hashing of {@link ArtifactKindDescriptor}s — the §5 backbone for
 * content-addressed schemas. Two descriptors with the same hash are treated as
 * the *same type* by `portAccepts`, regardless of their `(id, version)` or
 * source. The hash is deterministic, stable across processes, and depends only
 * on the descriptor's normalised structure.
 *
 * Inputs that feed the hash:
 *  - `simplifiedSchema` — canonical JSON of the JSON Schema describing the
 *    record's payload. The key ordering of the source JSON is irrelevant
 *    (canonicalised here), so a schema authored with different key orderings
 *    still collapses to the same hash.
 *  - `extends` — if the descriptor refines another kind, its *parent's* hash
 *    is folded in. Guarantees `Url ≠ String` even when their local schemas
 *    happen to be near-identical (`{value: string}` either way), because the
 *    refinement chain itself carries identity (cf. spec §5.3).
 *
 * Identity for synthesised parametric kinds is *compositional*, never
 * derived from the synthesised `simplifiedSchema` (which can pick up
 * round-tripping artifacts from `z.toJSONSchema`):
 *  - `List<T>`     → `{kind: "List",    inner:    H(T)}`
 *  - `OneOf<…>`    → `{kind: "OneOf",   variants: sort([H(A), H(B), …])}` —
 *                    variants are sorted so `OneOf<A,B>` and `OneOf<B,A>`
 *                    collapse, matching the set semantics enforced by
 *                    `portAccepts`.
 *  - `Success<T>`  → `{kind: "Success", inner:    H(T)}`
 *  - `Error<E>`    → `{kind: "Error",   inner:    H(E)}`
 *
 * Cache invariant (v1): user-record hashes are computed eagerly at save and
 * persisted on the row. If a refined record's *parent* later mutates, the
 * child's persisted hash becomes stale until the child is re-saved — eager
 * recompute of dependents is left as a follow-up (cf. spec §5 "Risques").
 */
import { createHash } from "node:crypto";
import {
  STRUCTURAL_HASH_SHORT_LEN,
  canonicalJson,
  truncateStructuralHash,
} from "../../../../shared/wf/structural-hash";
import type { ArtifactKind } from "./artifact";
import type { ArtifactKindDescriptor } from "./artifact-schema";

// Re-export the cross-runtime pieces so engine-side callers keep a single
// import path even though the canonicalisation now lives in shared/.
export { STRUCTURAL_HASH_SHORT_LEN, canonicalJson, truncateStructuralHash };

const sha256Hex = (bytes: string): string =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * Hash a leaf descriptor (built-in, user, plugin) from its `simplifiedSchema`
 * and refinement parent. The parent resolver returns the *current* hash of
 * the parent kind, or `null` when the parent is unknown — passing through
 * `null` makes parent-less roots and "parent not yet registered" cases
 * collide deterministically, which is the desired behaviour (the seed builds
 * built-ins in topological order, and dynamic records can only refine kinds
 * that already exist).
 */
export const computeStructuralHash = (
  descriptor: Pick<ArtifactKindDescriptor, "simplifiedSchema" | "extends">,
  resolveParentHash: (kind: ArtifactKind) => string | null,
): string => {
  const parentHash = descriptor.extends
    ? resolveParentHash(descriptor.extends)
    : null;
  return sha256Hex(
    canonicalJson({
      schema: descriptor.simplifiedSchema,
      parent: parentHash,
    }),
  );
};

/**
 * Compositional hash for a synthesised `List<T>` descriptor. Distinct prefix
 * (`{kind: "List", …}`) so a leaf hash and a list hash can never collide for
 * the same canonical byte sequence — without it, a record whose schema
 * happened to be `{kind: "List", inner: "<hex>"}` would collide.
 */
export const composeListStructuralHash = (innerHash: string): string =>
  sha256Hex(canonicalJson({ kind: "List", inner: innerHash }));

/**
 * Compositional hash for a synthesised `OneOf<…>` descriptor. Variant hashes
 * are sorted to match the set semantics enforced by `portAccepts` — a sum
 * type is identified by *which* variants it carries, not in which order.
 */
export const composeSumStructuralHash = (
  variantHashes: ReadonlyArray<string>,
): string => {
  const sorted = [...variantHashes].sort();
  return sha256Hex(canonicalJson({ kind: "OneOf", variants: sorted }));
};

/**
 * Compositional hash for a synthesised `Success<T>` / `Error<E>` wrapper.
 * The label is part of the tag so `Success<T>` and `Error<T>` carrying the
 * same inner kind never collapse.
 */
export const composeWrapperStructuralHash = (
  label: "Success" | "Error",
  innerHash: string,
): string => sha256Hex(canonicalJson({ kind: label, inner: innerHash }));

