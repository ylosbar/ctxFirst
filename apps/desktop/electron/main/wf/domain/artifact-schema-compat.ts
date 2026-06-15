/**
 * Static BACKWARD-compatibility classification for artifact schemas — the §2.3
 * admission gate, "Confluent Schema Registry rendered static". At save we ask:
 * does re-publishing a kind at the **same `(id, version)`** keep the new schema
 * able to read every payload that was valid under the old one (BACKWARD)?
 *
 * The verdict is derived from the two `simplifiedSchema` JSON blobs alone — no
 * artifact reads, fully deterministic. It encodes the widen-only lattice of
 * Iceberg/Avro: `next` must accept a **superset** of what `prev` accepted.
 *
 *  - add optional field, relax required→optional, widen a type, drop/loosen a
 *    constraint, a union gains a variant, `additionalProperties` opened up
 *      → `safe`
 *  - add required field, remove a field (when extra props are forbidden),
 *    optional→required, narrow a type, change a type, tighten/add a constraint,
 *    a union loses a variant, `additionalProperties` restricted
 *      → `breaking`
 *
 * Anything we cannot prove safe is classified `breaking` (conservative): the
 * author bumps to a new version, or re-saves with `allowBreaking` to overwrite
 * in place. The gate only protects the overwrite case — a bump publishes a new
 * identity and cannot break existing data, so it is never classified here.
 */
import { canonicalJson } from "./artifact-schema-hash";
import {
  applyDeclarativePatch,
  simulatePatchOnSchema,
  type CoerceFrom,
  type DeclarativePatch,
} from "./artifact-coercion";

export type SchemaDeltaKind =
  | "field-added-required"
  | "field-added-optional"
  | "field-removed"
  | "field-now-required"
  | "field-now-optional"
  | "type-changed"
  | "type-narrowed"
  | "type-widened"
  | "enum-narrowed"
  | "enum-widened"
  | "constraint-tightened"
  | "constraint-relaxed"
  | "additional-props-restricted"
  | "additional-props-relaxed"
  | "structure-changed";

export type SchemaDelta = {
  /** Dotted path to the changed node (`""`/`<root>` at top level). */
  path: string;
  kind: SchemaDeltaKind;
  /** `true` ⇒ a payload valid under `prev` may be rejected by `next`. */
  breaking: boolean;
  /** Human-readable, author-facing sentence (folded into the gate error). */
  detail: string;
};

export type SchemaCompatVerdict = {
  /** Every classified delta, safe and breaking, in discovery order. */
  deltas: ReadonlyArray<SchemaDelta>;
  /** The breaking subset — non-empty ⇒ the gate rejects the in-place save. */
  breaking: ReadonlyArray<SchemaDelta>;
};

type JsonObj = Record<string, unknown>;

const isObj = (v: unknown): v is JsonObj =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const canon = (v: unknown): string => canonicalJson(v);

const labelPath = (path: string): string => path || "<root>";

const push = (
  out: SchemaDelta[],
  path: string,
  kind: SchemaDeltaKind,
  breaking: boolean,
  detail: string,
): void => {
  out.push({ path, kind, breaking, detail });
};

type NodeKind = "object" | "array" | "union" | "primitive" | "unknown";

const nodeKind = (node: JsonObj): NodeKind => {
  if (Array.isArray(node.anyOf) || Array.isArray(node.oneOf)) return "union";
  if (node.type === "object" && isObj(node.properties)) return "object";
  if (node.type === "array") return "array";
  if (typeof node.type === "string" || Array.isArray(node.type)) {
    return "primitive";
  }
  if (Array.isArray(node.enum)) return "primitive";
  return "unknown";
};

const typeSet = (type: unknown): Set<string> => {
  if (typeof type === "string") return new Set([type]);
  if (Array.isArray(type)) {
    return new Set(type.filter((t): t is string => typeof t === "string"));
  }
  return new Set();
};

/** `integer` is a subtype of `number`; all other JSON Schema types are disjoint. */
const covers = (a: Set<string>, t: string): boolean =>
  a.has(t) || (t === "integer" && a.has("number"));

const isTypeSuperset = (a: Set<string>, b: Set<string>): boolean =>
  [...b].every((t) => covers(a, t));

const setEq = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((x) => b.has(x));

const unionVariants = (node: JsonObj): unknown[] => {
  if (Array.isArray(node.anyOf)) return node.anyOf;
  if (Array.isArray(node.oneOf)) return node.oneOf;
  return [node];
};

const isUnionNode = (node: JsonObj): boolean =>
  Array.isArray(node.anyOf) || Array.isArray(node.oneOf);

/** The canonical `const` carried by `variant.properties[key]`, or `null`. */
const constValue = (variant: JsonObj, key: string): string | null => {
  const props = isObj(variant.properties) ? variant.properties : {};
  const slot = props[key];
  return isObj(slot) && "const" in slot ? canon(slot.const) : null;
};

/**
 * A discriminated union (Zod `z.discriminatedUnion`) renders as `anyOf`/`oneOf`
 * of object variants that all share one property whose schema is a distinct
 * `const`. Returns that property name when it identifies the variants 1:1 — so
 * the comparer can match variants across versions by discriminant and recurse
 * into each (an additive edit inside one variant then classifies `safe`, rather
 * than the whole variant reading as replaced). `null` ⇒ no clean discriminant.
 */
const discriminantKey = (variants: JsonObj[]): string | null => {
  if (variants.length === 0) return null;
  const shared = variants.reduce<Set<string> | null>((acc, v) => {
    const props = isObj(v.properties) ? v.properties : {};
    const keys = Object.keys(props).filter(
      (k) => isObj(props[k]) && "const" in props[k],
    );
    return acc === null ? new Set(keys) : new Set([...acc].filter((k) => keys.includes(k)));
  }, null);
  if (!shared) return null;
  for (const key of shared) {
    const vals = variants.map((v) => constValue(v, key));
    if (vals.every((x) => x !== null) && new Set(vals).size === variants.length) {
      return key;
    }
  }
  return null;
};

// Constraint keys whose presence/increase tightens the accepted set (a larger
// minimum rejects more), and those whose increase loosens it (a larger maximum
// accepts more). Adding any of these to `next` that `prev` lacked is a tighten.
const MIN_KEYS = [
  "minimum",
  "exclusiveMinimum",
  "minLength",
  "minItems",
  "minProperties",
];
const MAX_KEYS = [
  "maximum",
  "exclusiveMaximum",
  "maxLength",
  "maxItems",
  "maxProperties",
];
// Equality-compared constraints: any add or change tightens, removal loosens.
const EXACT_KEYS = ["pattern", "format", "multipleOf"];

const asNum = (v: unknown): number | null =>
  typeof v === "number" ? v : null;

const compareConstraints = (
  prev: JsonObj,
  next: JsonObj,
  path: string,
  out: SchemaDelta[],
): void => {
  const tighten = (k: string) =>
    push(
      out,
      path,
      "constraint-tightened",
      true,
      `constraint \`${k}\` at ${labelPath(path)} tightened; existing values may fall outside`,
    );
  const relax = (k: string) =>
    push(
      out,
      path,
      "constraint-relaxed",
      false,
      `constraint \`${k}\` at ${labelPath(path)} relaxed`,
    );

  for (const k of MIN_KEYS) {
    const pv = asNum(prev[k]);
    const nv = asNum(next[k]);
    if (nv !== null && (pv === null || nv > pv)) tighten(k);
    else if (pv !== null && (nv === null || nv < pv)) relax(k);
  }
  for (const k of MAX_KEYS) {
    const pv = asNum(prev[k]);
    const nv = asNum(next[k]);
    if (nv !== null && (pv === null || nv < pv)) tighten(k);
    else if (pv !== null && (nv === null || nv > pv)) relax(k);
  }
  for (const k of EXACT_KEYS) {
    const has = (o: JsonObj) => o[k] !== undefined;
    if (has(next) && (!has(prev) || canon(prev[k]) !== canon(next[k]))) {
      tighten(k);
    } else if (has(prev) && !has(next)) {
      relax(k);
    }
  }
};

const compareEnum = (
  prev: JsonObj,
  next: JsonObj,
  path: string,
  out: SchemaDelta[],
): void => {
  const pEnum = prev.enum;
  const nEnum = next.enum;
  const pHas = Array.isArray(pEnum);
  const nHas = Array.isArray(nEnum);
  if (!pHas && !nHas) return;
  if (pHas && nHas) {
    const ps = new Set((pEnum as unknown[]).map(canon));
    const ns = new Set((nEnum as unknown[]).map(canon));
    const covered = [...ps].every((v) => ns.has(v));
    if (!covered) {
      push(
        out,
        path,
        "enum-narrowed",
        true,
        `allowed values at ${labelPath(path)} narrowed; existing values may no longer be permitted`,
      );
    } else if (ns.size > ps.size) {
      push(out, path, "enum-widened", false, `allowed values at ${labelPath(path)} widened`);
    }
    return;
  }
  if (pHas && !nHas) {
    push(out, path, "enum-widened", false, `enum constraint at ${labelPath(path)} dropped`);
  } else {
    push(
      out,
      path,
      "enum-narrowed",
      true,
      `enum constraint added at ${labelPath(path)}; existing values may fall outside`,
    );
  }
};

const comparePrimitive = (
  prev: JsonObj,
  next: JsonObj,
  path: string,
  out: SchemaDelta[],
): void => {
  const pType = typeSet(prev.type);
  const nType = typeSet(next.type);
  if (pType.size > 0 && nType.size > 0 && !setEq(pType, nType)) {
    if (isTypeSuperset(nType, pType)) {
      push(out, path, "type-widened", false, `type at ${labelPath(path)} widened`);
    } else if (isTypeSuperset(pType, nType)) {
      push(
        out,
        path,
        "type-narrowed",
        true,
        `type at ${labelPath(path)} narrowed ${[...pType].join("|")}→${[...nType].join("|")}`,
      );
      return;
    } else {
      push(
        out,
        path,
        "type-changed",
        true,
        `type at ${labelPath(path)} changed ${[...pType].join("|")}→${[...nType].join("|")}`,
      );
      return;
    }
  }
  compareEnum(prev, next, path, out);
  compareConstraints(prev, next, path, out);
};

const compareObjects = (
  prev: JsonObj,
  next: JsonObj,
  path: string,
  out: SchemaDelta[],
): void => {
  const pProps = isObj(prev.properties) ? prev.properties : {};
  const nProps = isObj(next.properties) ? next.properties : {};
  const pReq = new Set(
    (Array.isArray(prev.required) ? prev.required : []).filter(
      (x): x is string => typeof x === "string",
    ),
  );
  const nReq = new Set(
    (Array.isArray(next.required) ? next.required : []).filter(
      (x): x is string => typeof x === "string",
    ),
  );
  const pAllowsExtra = prev.additionalProperties !== false;
  const nAllowsExtra = next.additionalProperties !== false;

  if (pAllowsExtra && !nAllowsExtra) {
    push(
      out,
      path,
      "additional-props-restricted",
      true,
      `${labelPath(path)} no longer allows extra properties; payloads carrying them would be rejected`,
    );
  } else if (!pAllowsExtra && nAllowsExtra) {
    push(out, path, "additional-props-relaxed", false, `${labelPath(path)} now allows extra properties`);
  }

  for (const key of new Set([...Object.keys(pProps), ...Object.keys(nProps)])) {
    const fpath = path ? `${path}.${key}` : key;
    const inPrev = key in pProps;
    const inNext = key in nProps;
    if (inPrev && !inNext) {
      if (!nAllowsExtra) {
        push(
          out,
          fpath,
          "field-removed",
          true,
          `field \`${key}\` removed; existing payloads carrying it would be rejected`,
        );
      } else {
        push(
          out,
          fpath,
          "field-removed",
          false,
          `field \`${key}\` removed (tolerated: extra properties allowed)`,
        );
      }
      continue;
    }
    if (!inPrev && inNext) {
      if (nReq.has(key)) {
        push(
          out,
          fpath,
          "field-added-required",
          true,
          `required field \`${key}\` added; existing payloads omit it`,
        );
      } else {
        push(out, fpath, "field-added-optional", false, `optional field \`${key}\` added`);
      }
      continue;
    }
    const wasReq = pReq.has(key);
    const nowReq = nReq.has(key);
    if (!wasReq && nowReq) {
      push(
        out,
        fpath,
        "field-now-required",
        true,
        `field \`${key}\` became required; existing payloads may omit it`,
      );
    } else if (wasReq && !nowReq) {
      push(out, fpath, "field-now-optional", false, `field \`${key}\` became optional`);
    }
    compareNode(pProps[key], nProps[key], fpath, out);
  }
};

const compareUnion = (
  prev: JsonObj,
  next: JsonObj,
  path: string,
  out: SchemaDelta[],
): void => {
  const pRaw = unionVariants(prev);
  const nRaw = unionVariants(next);

  // Discriminated union: when both sides are genuine unions of object variants
  // sharing one discriminant `const` key, match variants by that value and
  // recurse into each. This is what keeps an additive edit *inside* a variant
  // (e.g. a new optional field) classified `safe` — whole-variant canonical
  // equality (the fallback below) would see the changed variant as replaced and
  // over-report `breaking`.
  if (isUnionNode(prev) && isUnionNode(next)) {
    const pObj = pRaw.filter(isObj);
    const nObj = nRaw.filter(isObj);
    if (pObj.length === pRaw.length && nObj.length === nRaw.length) {
      const key = discriminantKey(pObj);
      if (key && key === discriminantKey(nObj)) {
        const nByVal = new Map(nObj.map((v) => [constValue(v, key), v]));
        const pVals = new Set(pObj.map((v) => constValue(v, key)));
        for (const v of pObj) {
          const d = constValue(v, key);
          const match = nByVal.get(d);
          if (!match) {
            push(out, path, "type-narrowed", true, `union at ${labelPath(path)} dropped variant ${d}`);
          } else {
            compareNode(v, match, path, out);
          }
        }
        for (const v of nObj) {
          const d = constValue(v, key);
          if (!pVals.has(d)) {
            push(out, path, "type-widened", false, `union at ${labelPath(path)} gained variant ${d}`);
          }
        }
        return;
      }
    }
  }

  // Fallback: whole-variant set comparison — primitive / non-discriminated
  // unions where no per-variant identity is available to match across versions.
  const pSet = new Set(pRaw.map(canon));
  const nSet = new Set(nRaw.map(canon));
  const covered = [...pSet].every((v) => nSet.has(v));
  if (!covered) {
    push(
      out,
      path,
      "type-narrowed",
      true,
      `union at ${labelPath(path)} dropped or changed a variant`,
    );
  } else if (nSet.size > pSet.size) {
    push(out, path, "type-widened", false, `union at ${labelPath(path)} gained a variant`);
  }
};

const compareNode = (
  prev: unknown,
  next: unknown,
  path: string,
  out: SchemaDelta[],
): void => {
  if (!isObj(prev) || !isObj(next)) {
    if (canon(prev) !== canon(next)) {
      push(out, path, "structure-changed", true, `schema shape at ${labelPath(path)} changed`);
    }
    return;
  }
  // `$ref` nodes are opaque here — we do not resolve the pointer. The only
  // schema source (`z.toJSONSchema(..., { unrepresentable: "any" })`, no
  // metadata registry) inlines everything and emits at most a `#` self-ref for
  // recursion, whose target is the root we already diff. A *changed* ref is
  // conservatively breaking; equal refs carry no detectable delta. (A mutated
  // `$defs` target behind an unchanged ref string is a known blind spot —
  // unreachable in this codebase; closing it would require pointer resolution.)
  const pRef = typeof prev.$ref === "string" ? prev.$ref : null;
  const nRef = typeof next.$ref === "string" ? next.$ref : null;
  if (pRef !== null || nRef !== null) {
    if (pRef !== nRef) {
      push(out, path, "structure-changed", true, `schema reference at ${labelPath(path)} changed`);
    }
    return;
  }
  const pk = nodeKind(prev);
  const nk = nodeKind(next);
  if (pk === "object" && nk === "object") return compareObjects(prev, next, path, out);
  if (pk === "union" || nk === "union") return compareUnion(prev, next, path, out);
  if (pk === "array" && nk === "array") {
    compareConstraints(prev, next, path, out);
    compareNode(prev.items, next.items, `${path}[]`, out);
    return;
  }
  if (pk === "primitive" && nk === "primitive") {
    return comparePrimitive(prev, next, path, out);
  }
  if (canon(prev) !== canon(next)) {
    push(out, path, "type-changed", true, `node kind at ${labelPath(path)} changed (${pk}→${nk})`);
  }
};

/**
 * Classifies the delta between a kind's previously-stored `simplifiedSchema`
 * and the schema about to overwrite it at the same `(id, version)`. Pure and
 * total: any input shape yields a verdict (unrecognised structures collapse to
 * a conservative `breaking` `structure-changed`).
 */
export const classifyChange = (
  prevSchema: unknown,
  nextSchema: unknown,
): SchemaCompatVerdict => {
  const deltas: SchemaDelta[] = [];
  compareNode(prevSchema, nextSchema, "", deltas);
  return { deltas, breaking: deltas.filter((d) => d.breaking) };
};

/**
 * Raised by the registry's save gate when an **in-place** schema overwrite at
 * `(id, version)` would reject payloads valid under the stored schema. The
 * message is self-contained and actionable so it stays useful after crossing
 * the IPC boundary (where only the error message survives by default).
 */
export class ArtifactSchemaBreakingChangeError extends Error {
  constructor(
    readonly ref: { id: string; version: string; name?: string },
    readonly deltas: ReadonlyArray<SchemaDelta>,
  ) {
    const label = ref.name
      ? `${ref.name} (${ref.id}@${ref.version})`
      : `${ref.id}@${ref.version}`;
    super(
      `Saving ${label} would break existing data:\n` +
        deltas.map((d) => `  • ${d.detail}`).join("\n") +
        `\nExisting ${ref.id}@${ref.version} artifacts and consumers would no longer validate. ` +
        `Bump to a new version, or re-save with "allow breaking change" to overwrite in place.`,
    );
    this.name = "ArtifactSchemaBreakingChangeError";
  }
}

// ───────────────────────────────────────────────────────────────────────────
// BACKWARD_TRANSITIVE chain-soundness gate (§2.6 P4)
//
// In a content-addressed substrate a pinned `id@vPrev` record never reaches a
// `vN` consumer as raw bytes — it reaches it ONLY through a declared
// `coerceFrom` chain (`pickCoercionTarget` → the read-time patch). So the
// transitive obligation a save creates is exactly: **the coerceFrom chain
// hanging off `vN` is sound** — every ancestor reachable by following
// `coerceFrom.fromVersion` links, when a representative payload is run through
// the composed patch up to `vN`, still validates against `vN`. This is the
// runtime semantic the multi-step chain performs (writer→target composed once),
// classified statically at save time. Order-free: the chain is a linked list of
// `coerceFrom` pointers, never a sort over the (unordered) version strings.
// ───────────────────────────────────────────────────────────────────────────

/** Minimal validator surface the chain gate needs (Zod `safeParse`, structurally). */
type SchemaValidator = { safeParse: (value: unknown) => { success: boolean } };

/** The per-version descriptor data the chain gate reads for one ancestor. */
export type CoercionChainNode = {
  version: string;
  simplifiedSchema: unknown;
  schema: SchemaValidator;
  /** Stored representative payload, or `null` when none was authored. */
  sample: unknown | null;
  /** This version's own predecessor link, for walking further up the chain. */
  coerceFrom: CoerceFrom | null;
};

export type CoercionChainHopStatus = "ok" | "broken" | "degraded";

export type CoercionChainHop = {
  /** Ancestor (writer) version the obligation is checked from. */
  fromVersion: string;
  /** The version being saved (the chain target). */
  toVersion: string;
  status: CoercionChainHopStatus;
  /** Author-facing sentence; folded into {@link ArtifactSchemaChainUnsoundError}. */
  reason: string;
  /** Breaking deltas, when the structural-simulation check is what failed. */
  deltas?: ReadonlyArray<SchemaDelta>;
};

export type CoercionChainVerdict = {
  /** Every classified hop, in walk order. */
  hops: ReadonlyArray<CoercionChainHop>;
  /** The `broken` subset — non-empty ⇒ the gate rejects the save. */
  broken: ReadonlyArray<CoercionChainHop>;
  /** The `degraded` subset — verified with reduced confidence; never blocks. */
  degraded: ReadonlyArray<CoercionChainHop>;
};

/** Belt-and-suspenders bound past the cycle guard, for pathological chains. */
const MAX_COERCION_CHAIN_DEPTH = 64;

/**
 * Classifies one ancestor's obligation: a `node`-valid payload, run through the
 * `composed` patch (ancestor → target), must validate against the target. The
 * stored sample drives the high-confidence check (real data through the real
 * {@link applyDeclarativePatch} and target schema); schema-simulation is the
 * structural backstop when no usable sample exists. Precision-first: a `broken`
 * verdict requires a high-confidence failure, so a legitimate save is never
 * over-gated by an approximate simulation.
 */
const classifyAncestorHop = (
  node: CoercionChainNode,
  target: string,
  composed: DeclarativePatch,
  incoming: { simplifiedSchema: unknown; schema: SchemaValidator },
): CoercionChainHop => {
  const base = { fromVersion: node.version, toVersion: target };
  const usableSample =
    node.sample != null && node.schema.safeParse(node.sample).success;

  if (usableSample) {
    let result: unknown;
    try {
      result = applyDeclarativePatch(node.sample, composed);
    } catch (err) {
      return {
        ...base,
        status: "broken",
        reason: `coercing a @${node.version} sample to @${target} fails structurally: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
    if (!incoming.schema.safeParse(result).success) {
      return {
        ...base,
        status: "broken",
        reason: `a @${node.version} payload coerced to @${target} no longer validates against the @${target} schema`,
      };
    }
    return { ...base, status: "ok", reason: "sample dry-run passes" };
  }

  const sim = simulatePatchOnSchema(node.simplifiedSchema, composed);
  if (sim.degraded) {
    return {
      ...base,
      status: "degraded",
      reason: `no usable @${node.version} sample and the patch is not statically modellable (${sim.reason})`,
    };
  }
  const verdict = classifyChange(sim.schema, incoming.simplifiedSchema);
  if (verdict.breaking.length > 0) {
    return {
      ...base,
      status: "broken",
      reason: `a @${node.version} payload, coerced to @${target}, would not satisfy the @${target} schema`,
      deltas: verdict.breaking,
    };
  }
  return {
    ...base,
    status: "degraded",
    reason: `verified structurally only (no stored @${node.version} sample to dry-run)`,
  };
};

/**
 * Walks the `coerceFrom` chain hanging off the version being saved and verifies
 * each ancestor can be coerced forward to the target soundly. Pure: the only
 * outside data is `resolveAncestor`, injected by the adapter (mirrors
 * `resolveParentHash`) — the domain never reads the DB. Aborts the walk on a
 * cycle, a missing predecessor, or an over-deep chain, surfacing each as a
 * `broken` hop. Returns all hops (so an author fixing a chain sees every bad
 * link at once, like {@link classifyChange} collecting all deltas).
 */
export const classifyCoercionChain = (
  incoming: {
    version: string;
    simplifiedSchema: unknown;
    schema: SchemaValidator;
    sample: unknown | null;
    coerceFrom: CoerceFrom | null;
  },
  resolveAncestor: (version: string) => CoercionChainNode | null,
): CoercionChainVerdict => {
  const hops: CoercionChainHop[] = [];
  const target = incoming.version;
  if (!incoming.coerceFrom) return { hops, broken: [], degraded: [] };

  // 1. Build the chain: collect each ancestor with the patch mapping it to its
  //    immediate child (the child's `coerceFrom.patch`). Walk-failures abort.
  const links: Array<{ node: CoercionChainNode; patch: DeclarativePatch }> = [];
  const seen = new Set<string>([target]);
  let cursor: { coerceFrom: CoerceFrom | null } = incoming;
  while (cursor.coerceFrom) {
    const prevVersion = cursor.coerceFrom.fromVersion;
    const patch = cursor.coerceFrom.patch;
    if (seen.has(prevVersion)) {
      hops.push({
        fromVersion: prevVersion,
        toVersion: target,
        status: "broken",
        reason: `coercion chain cycles back to @${prevVersion}`,
      });
      break;
    }
    if (links.length >= MAX_COERCION_CHAIN_DEPTH) {
      hops.push({
        fromVersion: prevVersion,
        toVersion: target,
        status: "broken",
        reason: `coercion chain exceeds the maximum depth of ${MAX_COERCION_CHAIN_DEPTH}`,
      });
      break;
    }
    const ancestor = resolveAncestor(prevVersion);
    if (!ancestor) {
      // The predecessor schema isn't registered, so the chain can't be verified
      // past here. Not `broken`: a single adjacent coercion still fires at read
      // time (`pickCoercionTarget` matches the writer kind string without
      // resolving the predecessor's schema), so blocking would over-gate a valid
      // declaration. Surface reduced confidence and stop walking.
      hops.push({
        fromVersion: prevVersion,
        toVersion: target,
        status: "degraded",
        reason: `declared predecessor @${prevVersion} is not registered; chain not verified past it`,
      });
      break;
    }
    links.push({ node: ancestor, patch });
    seen.add(prevVersion);
    cursor = ancestor;
  }

  // 2. Per ancestor, verify the COMPOSED patch (writer→target) — exactly what
  //    the runtime chain applies once. `links[0]` is the target's own incoming
  //    hop; ancestor `i`'s composed patch is links[i..0] in writer→target order.
  for (let i = 0; i < links.length; i++) {
    const composed: DeclarativePatch = links
      .slice(0, i + 1)
      .map((link) => link.patch)
      .reverse()
      .flat();
    hops.push(classifyAncestorHop(links[i].node, target, composed, incoming));
  }

  return {
    hops,
    broken: hops.filter((h) => h.status === "broken"),
    degraded: hops.filter((h) => h.status === "degraded"),
  };
};

/**
 * Raised by the registry's save gate when a declared `coerceFrom` chain cannot
 * read prior-version data forward into the version being saved (§2.6 P4). Like
 * {@link ArtifactSchemaBreakingChangeError}, the message is self-contained so it
 * stays actionable across the IPC boundary; it lists one block per broken hop.
 */
export class ArtifactSchemaChainUnsoundError extends Error {
  constructor(
    readonly ref: { id: string; version: string; name?: string },
    readonly hops: ReadonlyArray<CoercionChainHop>,
  ) {
    const label = ref.name
      ? `${ref.name} (${ref.id}@${ref.version})`
      : `${ref.id}@${ref.version}`;
    const blocks = hops.map((h) => {
      const detail =
        h.deltas && h.deltas.length > 0
          ? `\n` + h.deltas.map((d) => `      • ${d.detail}`).join("\n")
          : ` — ${h.reason}`;
      return `  ${ref.id}@${h.fromVersion} → @${h.toVersion}:${detail}`;
    });
    super(
      `Saving ${label} declares a coercion chain that cannot read prior data:\n` +
        blocks.join("\n") +
        `\nA payload written under an earlier version, coerced forward, would no longer validate. ` +
        `Fix the \`coerceFrom\` patch, bump to a fresh version, or re-save with "allow breaking change".`,
    );
    this.name = "ArtifactSchemaChainUnsoundError";
  }
}
