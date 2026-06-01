/**
 * Pure string predicates and parsers for the {@link ArtifactKind} grammar.
 * Lives in `shared/` so both the engine (`domain/artifact.ts`) and the
 * renderer-side / shared `portAccepts` can speak the same encoding without
 * crossing the renderer ⟂ Node isolation.
 *
 * The grammar is intentionally small and decoupled from the strict
 * `ArtifactKind` union: callers on each side cast back to their own union
 * after a successful parse.
 */

/**
 * Maximum nesting depth for parametric kinds. Bounds parser cost and prevents
 * adversarial inputs like `List<List<List<...>>>` from exploding validation.
 * Spec §Risques. Adjustable, not an invariant.
 */
export const MAX_KIND_DEPTH = 4;

/**
 * Maximum number of variants accepted by a `OneOf<…>` sum kind. Bounds the
 * UI port surface of `branch.match` and the cost of `portAccepts` over sums.
 * Spec §Risques. Adjustable, not an invariant.
 */
export const MAX_SUM_VARIANTS = 6;

/** `true` when `kind` is a `List<…>` container encoding. */
export const isContainerArtifactKind = (kind: string): boolean =>
  kind.startsWith("List<") && kind.endsWith(">");

/**
 * Extracts the inner element kind from a `List<T>` encoding. Returns `null`
 * for malformed inputs (unbalanced chevrons, empty body, exceeds
 * {@link MAX_KIND_DEPTH}). The returned string is itself a valid kind and
 * may be re-parsed for nested lists.
 */
export const parseListArtifactKind = (kind: string): string | null => {
  if (!isContainerArtifactKind(kind)) return null;
  const inner = kind.slice("List<".length, -1);
  if (inner.length === 0) return null;
  let depth = 0;
  let maxDepth = 0;
  for (const c of inner) {
    if (c === "<") {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (c === ">") {
      depth--;
    }
    if (depth < 0) return null;
  }
  if (depth !== 0) return null;
  // +1 accounts for the outer `List<…>` we just stripped.
  if (maxDepth + 1 > MAX_KIND_DEPTH) return null;
  return inner;
};

/** `true` when `kind` is a `OneOf<…>` sum encoding. */
export const isSumArtifactKind = (kind: string): boolean =>
  kind.startsWith("OneOf<") && kind.endsWith(">");

/**
 * Splits the body of a parametric kind at top-level commas, respecting nested
 * `<…>` pairs. Returns `null` if chevrons are unbalanced. Used by the OneOf
 * parser; the List parser does not need this because lists have a single
 * inner kind.
 */
const splitAtTopLevel = (body: string): string[] | null => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "<") depth++;
    else if (c === ">") {
      depth--;
      if (depth < 0) return null;
    } else if (c === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0) return null;
  parts.push(body.slice(start));
  return parts;
};

/**
 * Extracts the variant kinds from a `OneOf<A,B,…>` encoding. Returns `null`
 * for malformed inputs (unbalanced chevrons, empty body, fewer than two
 * variants, duplicates, exceeds {@link MAX_KIND_DEPTH} or
 * {@link MAX_SUM_VARIANTS}). The returned strings are themselves valid kinds
 * and may be re-parsed for nested sums.
 *
 * Encoding is strict: no whitespace tolerated. Templates that need a sum kind
 * encode it verbatim (the spec asks for `split(',')` at depth 0).
 */
export const parseSumArtifactKind = (kind: string): string[] | null => {
  if (!isSumArtifactKind(kind)) return null;
  const inner = kind.slice("OneOf<".length, -1);
  if (inner.length === 0) return null;
  const parts = splitAtTopLevel(inner);
  if (!parts) return null;
  if (parts.length < 2 || parts.length > MAX_SUM_VARIANTS) return null;
  // No empty variants — `OneOf<Markdown,>` is malformed.
  if (parts.some((p) => p.length === 0)) return null;
  // No duplicate variants — `OneOf<A,A>` collapses to `A` and is rejected
  // to surface the modelling error at the source.
  if (new Set(parts).size !== parts.length) return null;
  // Cap the deepest nested chevron pair (one extra for the outer `OneOf<…>`).
  let depth = 0;
  let maxDepth = 0;
  for (const c of inner) {
    if (c === "<") {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (c === ">") {
      depth--;
    }
  }
  if (maxDepth + 1 > MAX_KIND_DEPTH) return null;
  return parts;
};

/** `true` when `kind` is a `Success<…>` encoding. */
export const isSuccessArtifactKind = (kind: string): boolean =>
  kind.startsWith("Success<") && kind.endsWith(">");

/** `true` when `kind` is an `Error<…>` encoding. */
export const isErrorArtifactKind = (kind: string): boolean =>
  kind.startsWith("Error<") && kind.endsWith(">");

const parseSingleParam = (
  kind: string,
  prefix: string,
): string | null => {
  const inner = kind.slice(prefix.length, -1);
  if (inner.length === 0) return null;
  let depth = 0;
  let maxDepth = 0;
  for (const c of inner) {
    if (c === "<") {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (c === ">") {
      depth--;
    }
    if (depth < 0) return null;
  }
  if (depth !== 0) return null;
  if (maxDepth + 1 > MAX_KIND_DEPTH) return null;
  return inner;
};

/**
 * Extracts the inner kind from a `Success<T>` encoding. Returns `null` for
 * malformed inputs. `Success<T>` is sugar for a record `{variant: "Success",
 * value: T}` — implemented identically to `List<T>` at the grammar level.
 */
export const parseSuccessArtifactKind = (kind: string): string | null =>
  isSuccessArtifactKind(kind) ? parseSingleParam(kind, "Success<") : null;

/**
 * Extracts the inner kind from an `Error<E>` encoding. Returns `null` for
 * malformed inputs. Mirror of `parseSuccessArtifactKind`.
 */
export const parseErrorArtifactKind = (kind: string): string | null =>
  isErrorArtifactKind(kind) ? parseSingleParam(kind, "Error<") : null;

/**
 * Legacy aliases: the original top-level `MarkdownList`/`PathList` kinds are
 * structurally equivalent to `List<Markdown>`/`List<Path>` in the new
 * grammar. `portAccepts` substitutes on each side before comparing so
 * existing templates that mention either spelling stay valid.
 */
export const LEGACY_LIST_ALIAS: Readonly<Record<string, string>> = {
  MarkdownList: "List<Markdown>",
  PathList: "List<Path>",
};

/** Returns the canonical `List<T>` form for a legacy `XList` kind, or `null`. */
export const canonicalisedFromLegacyList = (kind: string): string | null =>
  LEGACY_LIST_ALIAS[kind] ?? null;

/**
 * Content-addressed kind encoding (§5). `record:<hash>` references a
 * descriptor by its structural hash; the registry resolves the (possibly
 * truncated) hex prefix back to the matching descriptor. Lowercased hex only;
 * a short form is 16 hex chars (`STRUCTURAL_HASH_SHORT_LEN`) and the full
 * form is 64 (SHA-256).
 */
export const isContentAddressedArtifactKind = (kind: string): boolean =>
  /^record:[a-f0-9]{16,64}$/.test(kind);

/**
 * Extracts the hex hash (or hash prefix) from a `record:<hash>` encoding.
 * Returns `null` for malformed inputs — callers should treat that as an
 * unknown kind rather than retrying with a default.
 */
export const parseContentAddressedArtifactKind = (
  kind: string,
): string | null => {
  if (!isContentAddressedArtifactKind(kind)) return null;
  return kind.slice("record:".length);
};
