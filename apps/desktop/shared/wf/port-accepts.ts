/**
 * Shared port-typing predicates used by both the engine
 * (`validate-template-ports.ts`) and the renderer (`isValidConnection`,
 * `EdgeDropSuggestions`). Keeping the predicate in one place is the only way
 * to avoid the editor accepting a connection the engine later refuses (or
 * vice versa).
 */
import {
  canonicalisedFromLegacyList,
  isContainerArtifactKind,
  isSumArtifactKind,
  parseListArtifactKind,
  parseSumArtifactKind,
} from "./artifact-kind-grammar";
import { WILDCARD_KIND, type NodeSpecView, type PortView } from "./types";

/**
 * Canonicalises a kind string before comparison: the legacy top-level
 * `MarkdownList`/`PathList` collapse to their `List<…>` form so a producer
 * of either spelling matches a consumer of the other.
 */
const canonicalise = (kind: string): string =>
  canonicalisedFromLegacyList(kind) ?? kind;

/**
 * Minimal descriptor view exposed by the resolver to `portAccepts`. Keeping
 * the type narrow lets each side pass a tiny adapter without leaking its full
 * descriptor shape across the renderer ⟂ Node boundary.
 *
 * Fields, in order of use:
 *  - `extends` (§2) drives the refinement-covariance walk.
 *  - `structuralHash` (§5) drives content-addressed equality: two descriptors
 *    with the same hash are accepted by each other's ports regardless of
 *    `(id, version)` or source. Optional — legacy callers that don't surface
 *    a hash just skip that path.
 */
export type RefinementParentResolver = (
  kind: string,
) => {
  extends: string | null;
  structuralHash?: string;
} | null;

/** Walks the `extends` chain looking for any port-accepted parent. */
const matchesViaExtendsChain = (
  port: Pick<PortView, "kinds">,
  kind: string,
  resolver: RefinementParentResolver,
): boolean => {
  const seen = new Set<string>();
  let current: string | null = kind;
  while (current && !seen.has(current)) {
    seen.add(current);
    const rec = resolver(current);
    if (!rec) return false;
    const parent = rec.extends;
    if (!parent) return false;
    const canonicalParent = canonicalise(parent);
    if (
      port.kinds.includes(parent) ||
      port.kinds.includes(canonicalParent) ||
      port.kinds.some((k) => canonicalise(k) === canonicalParent)
    ) {
      return true;
    }
    current = parent;
  }
  return false;
};

/**
 * Returns `true` if any of `port.kinds` resolves to the same structural hash
 * as `kind`. Drives §5 content-addressed equality: two records with the same
 * shape are interchangeable regardless of `(id, version)` or source. Skipped
 * silently when the resolver doesn't surface hashes (legacy callers).
 */
const matchesViaStructuralHash = (
  port: Pick<PortView, "kinds">,
  kind: string,
  resolver: RefinementParentResolver,
): boolean => {
  const producedHash = resolver(kind)?.structuralHash;
  if (!producedHash) return false;
  for (const accepted of port.kinds) {
    const acceptedHash = resolver(accepted)?.structuralHash;
    if (acceptedHash && acceptedHash === producedHash) return true;
  }
  return false;
};

/**
 * Returns `true` when an artifact of `kind` is accepted by `port`.
 *
 * Accept paths (in order, short-circuited):
 *  1. Wildcard port — accepts anything.
 *  2. Direct kind match (also under the legacy alias canonicalisation).
 *  3. `List<X>` covariance — `List<X>` ⊆ `List<Y>` iff `X` ⊆ `Y` (§1).
 *  4. `OneOf<…>` sum compat (§4) — élargissement (`A → OneOf<A,B>`) and
 *     subset (`OneOf<A> → OneOf<A,B>`). The reverse direction
 *     (`OneOf<A,B> → A`) is refused — that requires `branch.match`.
 *  5. Refinement covariance — a refinement of `X` is accepted by a port
 *     accepting `X` (§2). Resolver-driven and bounded by a `seen` set to
 *     stay safe against a corrupted registry.
 *  6. Structural-hash equality — a record with the same `structuralHash` as
 *     one of `port.kinds` flows through, regardless of name or source (§5).
 *     Skipped when the resolver doesn't expose a hash.
 *
 * The resolver is optional: callers without registry access (tests, code
 * paths that pre-date §2) get only paths 1–4. Paths 1–4 cover the bulk of
 * the validations done from the renderer's hot loops.
 */
export const portAccepts = (
  port: Pick<PortView, "kinds">,
  kind: string,
  resolver?: RefinementParentResolver,
): boolean => {
  if (port.kinds.includes(WILDCARD_KIND)) return true;
  // Direct hit on either the original or the canonical spelling.
  const canonicalKind = canonicalise(kind);
  if (port.kinds.includes(kind) || port.kinds.includes(canonicalKind)) {
    return true;
  }
  for (const accepted of port.kinds) {
    if (accepted === canonicalKind) return true;
    if (canonicalise(accepted) === canonicalKind) return true;
  }

  // List covariance: `List<X>` flows into any port accepting `List<Y>`
  // iff `X` flows into a `{kinds: [Y]}` port. The legacy `MarkdownList` /
  // `PathList` aliases have already been folded into their `List<…>` form
  // by `canonicalise`, so a single rule covers both spellings.
  //
  // Falls through to the OneOf branch on no-match — a list producer might
  // also satisfy a sum port that includes its list type as a variant
  // (`List<Markdown>` → `OneOf<List<Markdown>,Path>`).
  if (isContainerArtifactKind(canonicalKind)) {
    const innerKind = parseListArtifactKind(canonicalKind);
    if (
      innerKind &&
      port.kinds.some((accepted) => {
        const acceptedCanonical = canonicalise(accepted);
        const acceptedInner = parseListArtifactKind(acceptedCanonical);
        if (!acceptedInner) return false;
        return portAccepts({ kinds: [acceptedInner] }, innerKind, resolver);
      })
    ) {
      return true;
    }
    // Fall through to the OneOf branch and the refinement walk: a list
    // producer may also satisfy a sum port that includes its list type as a
    // variant, and a synthesised list descriptor has `extends: null` so the
    // refinement chain stops immediately — cheap.
  }

  // OneOf rules. Two compatibility directions matter:
  //   (1) Élargissement   — producer `A`, port `OneOf<A,B>` : OK if `A` is
  //                         accepted by some variant of the sum.
  //   (2) Sous-ensemble   — producer `OneOf<A>`, port `OneOf<A,B>` : OK if
  //                         every produced variant is accepted by some port
  //                         variant.
  // The mirror cases (producer `OneOf<A,B>`, port `A`) are intentionally
  // refused — extracting a sum variant requires an explicit `branch.match`.
  const producedVariants = isSumArtifactKind(canonicalKind)
    ? parseSumArtifactKind(canonicalKind)
    : null;
  for (const accepted of port.kinds) {
    const acceptedCanonical = canonicalise(accepted);
    if (!isSumArtifactKind(acceptedCanonical)) continue;
    const acceptedVariants = parseSumArtifactKind(acceptedCanonical);
    if (!acceptedVariants) continue;
    if (producedVariants) {
      // (2) Subset — every produced variant must be acceptable by some
      // port variant. Empty intersection ⇒ no flow.
      const allCovered = producedVariants.every((pv) =>
        acceptedVariants.some((av) => portAccepts({ kinds: [av] }, pv, resolver)),
      );
      if (allCovered) return true;
    } else {
      // (1) Élargissement — the scalar producer kind needs to match some
      // variant of the sum (variant compat handled recursively, so
      // `String → OneOf<Url,Markdown>` works through refinements).
      if (
        acceptedVariants.some((av) =>
          portAccepts({ kinds: [av] }, canonicalKind, resolver),
        )
      ) {
        return true;
      }
    }
  }

  if (resolver && matchesViaExtendsChain(port, canonicalKind, resolver)) {
    return true;
  }
  if (resolver && matchesViaStructuralHash(port, canonicalKind, resolver)) {
    return true;
  }
  return false;
};

/**
 * Returns `true` if a non-loop edge from `fromSpec` to `toSpec` is type-safe.
 * Mirrors the rules of `validateTemplatePorts`:
 *  - if `fromSpec.passthrough` is true (side-effect node, no artifact) the
 *    transition is allowed regardless of kinds — it's an execution-only wire
 *    and the downstream input is resolved from the previous data-producing
 *    ancestor at runtime,
 *  - else `fromSpec.outputs` must contain at least one slot,
 *  - `toSpec.inputs` must be non-empty,
 *  - if `fromPort` is provided the named output is selected; otherwise the
 *    unique output is used (multi-output ⇒ caller must provide `fromPort`),
 *  - if `toPort` is provided the named input must accept the source kind,
 *    else any input accepting the source kind makes the edge valid.
 *
 * v1 cap: caller is expected to enforce `inputs.length <= 1` separately.
 */
export const transitionTypable = (
  fromSpec: Pick<NodeSpecView, "outputs" | "passthrough">,
  toSpec: Pick<NodeSpecView, "inputs">,
  opts?: { fromPort?: string; toPort?: string; resolver?: RefinementParentResolver },
): boolean => {
  // Side-effect node: execution-only wire. Anything downstream is fine —
  // including inputless nodes (e.g. `user.input` reads `seedArtifacts`
  // directly when chained after `workspace.set` as the entry hop).
  if (fromSpec.passthrough && fromSpec.outputs.length === 0) return true;
  const out = opts?.fromPort
    ? fromSpec.outputs.find((o) => o.name === opts.fromPort)
    : fromSpec.outputs.length === 1
      ? fromSpec.outputs[0]
      : null;
  if (!out) return false;
  if (toSpec.inputs.length === 0) return false;
  if (opts?.toPort) {
    const targeted = toSpec.inputs.find((p) => p.name === opts.toPort);
    if (!targeted) return false;
    return portAccepts(targeted, out.kind, opts?.resolver);
  }
  return toSpec.inputs.some((p) => portAccepts(p, out.kind, opts?.resolver));
};
