/**
 * Read-time coercion (cf. `specs/techstrategy-artifact-types-solution.md` §2.4).
 *
 * A {@link CoerceFrom} declaration sits on a descriptor for `id@vNext` and
 * names exactly one predecessor version `id@vPrev` it can upgrade, plus a
 * **declarative** patch that reshapes a `vPrev` payload into the `vNext` shape.
 *
 * The patch is *data*, never a closure — the only representation that (i)
 * persists in SQLite (`coerce_from_json`) and (ii) is replay-deterministic.
 * `applyDeclarativePatch` is a pure, total function of `(payload, patch)`:
 * Avro reader-vs-writer resolution, constrained to a single adjacent same-`id`
 * step where the writer IS the stored artifact's `meta.kind`.
 *
 * Vocabulary deliberately tiny (4 idempotent ops, Sanity/Contentful style):
 * value transforms that can't be expressed as set/unset/rename fall back to an
 * engineer-written fs migration on the P2 primitive.
 */

/** A path into the (JSON-object) payload, e.g. `"summary"` or `"meta.title"`. */
export type PatchPath = string;

/**
 * One declarative reshape step. Each op is idempotent on its own so a patch
 * applied twice equals applied once — the property that makes read-time replay
 * safe even if a payload is somehow read through coercion more than once.
 */
export type PatchOp =
  | { op: "set"; at: PatchPath; value: unknown }
  | { op: "setIfMissing"; at: PatchPath; value: unknown }
  | { op: "unset"; at: PatchPath }
  | { op: "rename"; from: PatchPath; at: PatchPath };

/** Ordered list of reshape steps, applied left-to-right. */
export type DeclarativePatch = ReadonlyArray<PatchOp>;

/**
 * Declares that the descriptor it sits on can read a payload written under
 * `fromVersion` (same logical `id`) by running `patch` over it before
 * validation.
 */
export type CoerceFrom = {
  /** Exact predecessor version this descriptor upgrades (e.g. `"v1"`). */
  fromVersion: string;
  /** Declarative reshape from the predecessor payload to this version's shape. */
  patch: DeclarativePatch;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const splitPath = (at: PatchPath): string[] => at.split(".");

/**
 * Walks to the parent record of the final path segment, creating intermediate
 * records when `create` is set. Returns `null` when the path is blocked by a
 * non-record value (e.g. `a.b` when `a` is a string) — the caller decides
 * whether that is a no-op (read/unset) or an error (write).
 */
const parentOf = (
  root: Record<string, unknown>,
  segs: string[],
  create: boolean,
): Record<string, unknown> | null => {
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const next = cur[seg];
    if (isRecord(next)) {
      cur = next;
      continue;
    }
    if (next === undefined && create) {
      const created: Record<string, unknown> = {};
      cur[seg] = created;
      cur = created;
      continue;
    }
    return null;
  }
  return cur;
};

const clone = <T>(value: T): T =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);

/**
 * Applies a {@link DeclarativePatch} to a JSON payload, returning a new value
 * (the input is never mutated). Pure and deterministic.
 *
 * Throws when an op cannot be carried out structurally (a write into a path
 * blocked by a non-record, or a patch over a non-record root) — those are
 * authoring bugs in the `coerceFrom` declaration, surfaced loudly at the read
 * site rather than silently dropping data.
 */
export const applyDeclarativePatch = (
  payload: unknown,
  patch: DeclarativePatch,
): unknown => {
  if (patch.length === 0) return payload;
  if (!isRecord(payload)) {
    throw new Error(
      `coercion patch expects an object payload, got ${
        payload === null ? "null" : Array.isArray(payload) ? "array" : typeof payload
      }`,
    );
  }
  const root = clone(payload);
  for (const op of patch) {
    if (op.op === "rename") {
      const fromSegs = splitPath(op.from);
      const fromParent = parentOf(root, fromSegs, false);
      const fromKey = fromSegs[fromSegs.length - 1];
      if (!fromParent || !(fromKey in fromParent)) continue; // source absent → no-op
      const value = fromParent[fromKey];
      delete fromParent[fromKey];
      writeAt(root, splitPath(op.at), value);
      continue;
    }
    if (op.op === "unset") {
      const segs = splitPath(op.at);
      const parent = parentOf(root, segs, false);
      if (parent) delete parent[segs[segs.length - 1]];
      continue;
    }
    // set / setIfMissing
    const segs = splitPath(op.at);
    if (op.op === "setIfMissing") {
      const parent = parentOf(root, segs, false);
      const key = segs[segs.length - 1];
      if (parent && key in parent) continue; // already present → no-op
    }
    writeAt(root, segs, op.value);
  }
  return root;
};

/** Sets `value` at `segs`, creating intermediate records; throws if blocked. */
const writeAt = (
  root: Record<string, unknown>,
  segs: string[],
  value: unknown,
): void => {
  const parent = parentOf(root, segs, true);
  if (!parent) {
    throw new Error(
      `coercion patch cannot write at "${segs.join(".")}": path blocked by a non-object`,
    );
  }
  parent[segs[segs.length - 1]] = value;
};

const PATCH_OPS = new Set(["set", "setIfMissing", "unset", "rename"]);

/**
 * Validates an untrusted value as a {@link DeclarativePatch}, returning the
 * typed array or throwing a descriptive error. Used at the save boundary so a
 * malformed patch is rejected when authored, not at a future read.
 */
export const validateDeclarativePatch = (raw: unknown): DeclarativePatch => {
  if (!Array.isArray(raw)) {
    throw new Error("coerceFrom.patch must be an array of patch ops");
  }
  return raw.map((item, i) => {
    if (!isRecord(item)) {
      throw new Error(`coerceFrom.patch[${i}] must be an object`);
    }
    const op = item.op;
    if (typeof op !== "string" || !PATCH_OPS.has(op)) {
      throw new Error(
        `coerceFrom.patch[${i}].op must be one of set|setIfMissing|unset|rename (got ${String(op)})`,
      );
    }
    if (op === "rename") {
      if (typeof item.from !== "string" || item.from.length === 0) {
        throw new Error(`coerceFrom.patch[${i}] (rename) requires a non-empty "from"`);
      }
    }
    if (typeof item.at !== "string" || item.at.length === 0) {
      throw new Error(`coerceFrom.patch[${i}] requires a non-empty "at"`);
    }
    if ((op === "set" || op === "setIfMissing") && !("value" in item)) {
      throw new Error(`coerceFrom.patch[${i}] (${op}) requires a "value"`);
    }
    return item as unknown as PatchOp;
  });
};

/**
 * Validates an untrusted value as a {@link CoerceFrom}, returning the typed
 * shape or throwing. `fromVersion` must be a non-empty string and `patch` a
 * valid {@link DeclarativePatch}.
 */
export const validateCoerceFrom = (raw: unknown): CoerceFrom => {
  if (!isRecord(raw)) throw new Error("coerceFrom must be an object");
  if (typeof raw.fromVersion !== "string" || raw.fromVersion.length === 0) {
    throw new Error("coerceFrom.fromVersion must be a non-empty string");
  }
  return {
    fromVersion: raw.fromVersion,
    patch: validateDeclarativePatch(raw.patch),
  };
};

/**
 * Parses a stored `coerce_from_json` column value into a {@link CoerceFrom}.
 * Returns `null` for `null`/empty or any malformed content — a read must never
 * crash on a corrupt column; a missing coercion just means "no upgrade".
 */
export const parseCoerceFromColumn = (json: string | null): CoerceFrom | null => {
  if (json == null || json.length === 0) return null;
  try {
    return validateCoerceFrom(JSON.parse(json));
  } catch {
    return null;
  }
};
