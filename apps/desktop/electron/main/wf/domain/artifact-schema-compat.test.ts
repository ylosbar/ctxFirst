import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ArtifactSchemaBreakingChangeError,
  ArtifactSchemaChainUnsoundError,
  classifyChange,
  classifyCoercionChain,
  type CoercionChainNode,
  type SchemaDeltaKind,
} from "./artifact-schema-compat";
import type { CoerceFrom } from "./artifact-coercion";

/** Object schema in the shape `z.toJSONSchema(z.object(...))` produces. */
const obj = (
  properties: Record<string, unknown>,
  required: string[] = [],
  extra: Record<string, unknown> = {},
) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
  ...extra,
});

const kindsOf = (
  prev: unknown,
  next: unknown,
): { breaking: SchemaDeltaKind[]; safe: SchemaDeltaKind[] } => {
  const v = classifyChange(prev, next);
  return {
    breaking: v.breaking.map((d) => d.kind),
    safe: v.deltas.filter((d) => !d.breaking).map((d) => d.kind),
  };
};

describe("classifyChange — object fields", () => {
  it("identical schema yields no deltas (idempotent re-save)", () => {
    const s = obj({ a: { type: "string" } }, ["a"]);
    const v = classifyChange(s, structuredClone(s));
    expect(v.deltas).toHaveLength(0);
    expect(v.breaking).toHaveLength(0);
  });

  it("adding an optional field is safe", () => {
    const r = kindsOf(
      obj({ a: { type: "string" } }, ["a"]),
      obj({ a: { type: "string" }, b: { type: "number" } }, ["a"]),
    );
    expect(r.breaking).toEqual([]);
    expect(r.safe).toContain("field-added-optional");
  });

  it("adding a required field is breaking", () => {
    const r = kindsOf(
      obj({ a: { type: "string" } }, ["a"]),
      obj({ a: { type: "string" }, b: { type: "number" } }, ["a", "b"]),
    );
    expect(r.breaking).toContain("field-added-required");
  });

  it("removing a field is breaking when extra props are forbidden", () => {
    const r = kindsOf(
      obj({ a: { type: "string" }, b: { type: "number" } }, ["a"]),
      obj({ a: { type: "string" } }, ["a"]),
    );
    expect(r.breaking).toContain("field-removed");
  });

  it("removing a field is safe when extra props are allowed", () => {
    const prev = obj({ a: { type: "string" }, b: { type: "number" } }, ["a"], {
      additionalProperties: true,
    });
    const next = obj({ a: { type: "string" } }, ["a"], {
      additionalProperties: true,
    });
    const r = kindsOf(prev, next);
    expect(r.breaking).toEqual([]);
    expect(r.safe).toContain("field-removed");
  });

  it("required → optional is safe; optional → required is breaking", () => {
    const a = obj({ x: { type: "string" } }, ["x"]);
    const b = obj({ x: { type: "string" } }, []);
    expect(kindsOf(a, b).safe).toContain("field-now-optional");
    expect(kindsOf(b, a).breaking).toContain("field-now-required");
  });

  it("restricting additionalProperties is breaking; opening it is safe", () => {
    const open = obj({ a: { type: "string" } }, ["a"], {
      additionalProperties: true,
    });
    const closed = obj({ a: { type: "string" } }, ["a"]);
    expect(kindsOf(open, closed).breaking).toContain("additional-props-restricted");
    expect(kindsOf(closed, open).safe).toContain("additional-props-relaxed");
  });

  it("reports nested field changes with a dotted path", () => {
    const prev = obj({ o: obj({ x: { type: "string" } }, ["x"]) }, ["o"]);
    const next = obj({ o: obj({}, []) }, ["o"]);
    const v = classifyChange(prev, next);
    expect(v.breaking.map((d) => d.path)).toContain("o.x");
  });
});

describe("classifyChange — primitive types", () => {
  it("integer → number is a safe widen; number → integer is breaking", () => {
    const int = obj({ n: { type: "integer" } }, ["n"]);
    const num = obj({ n: { type: "number" } }, ["n"]);
    expect(kindsOf(int, num).safe).toContain("type-widened");
    expect(kindsOf(num, int).breaking).toContain("type-narrowed");
  });

  it("an unrelated type change is breaking", () => {
    const r = kindsOf(
      obj({ v: { type: "string" } }, ["v"]),
      obj({ v: { type: "number" } }, ["v"]),
    );
    expect(r.breaking).toContain("type-changed");
  });

  it("adding a nullable union member is a safe widen", () => {
    const r = kindsOf(
      obj({ v: { type: "string" } }, ["v"]),
      obj({ v: { type: ["string", "null"] } }, ["v"]),
    );
    expect(r.breaking).toEqual([]);
    expect(r.safe).toContain("type-widened");
  });
});

describe("classifyChange — enums and constraints", () => {
  it("widening an enum is safe; narrowing it is breaking", () => {
    const small = obj({ k: { type: "string", enum: ["a", "b"] } }, ["k"]);
    const big = obj({ k: { type: "string", enum: ["a", "b", "c"] } }, ["k"]);
    expect(kindsOf(small, big).safe).toContain("enum-widened");
    expect(kindsOf(big, small).breaking).toContain("enum-narrowed");
  });

  it("adding an enum constraint is breaking; dropping it is safe", () => {
    const plain = obj({ k: { type: "string" } }, ["k"]);
    const enumed = obj({ k: { type: "string", enum: ["a"] } }, ["k"]);
    expect(kindsOf(plain, enumed).breaking).toContain("enum-narrowed");
    expect(kindsOf(enumed, plain).safe).toContain("enum-widened");
  });

  it("tightening a numeric bound is breaking; loosening is safe", () => {
    const loose = obj({ n: { type: "number", minimum: 0 } }, ["n"]);
    const tight = obj({ n: { type: "number", minimum: 5 } }, ["n"]);
    expect(kindsOf(loose, tight).breaking).toContain("constraint-tightened");
    expect(kindsOf(tight, loose).safe).toContain("constraint-relaxed");
  });

  it("adding a pattern is breaking; removing it is safe", () => {
    const plain = obj({ s: { type: "string" } }, ["s"]);
    const patterned = obj({ s: { type: "string", pattern: "^[A-Z]+$" } }, ["s"]);
    expect(kindsOf(plain, patterned).breaking).toContain("constraint-tightened");
    expect(kindsOf(patterned, plain).safe).toContain("constraint-relaxed");
  });
});

describe("classifyChange — unions", () => {
  it("a union that gains a variant is safe; losing one is breaking", () => {
    const small = { anyOf: [{ type: "string" }, { type: "number" }] };
    const big = {
      anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
    };
    expect(kindsOf(small, big).safe).toContain("type-widened");
    expect(kindsOf(big, small).breaking).toContain("type-narrowed");
  });
});

describe("classifyChange — arrays", () => {
  const arr = (items: unknown, extra: Record<string, unknown> = {}) => ({
    type: "array",
    items,
    ...extra,
  });

  it("widening the item type is safe; narrowing it is breaking", () => {
    const ints = obj({ xs: arr({ type: "integer" }) }, ["xs"]);
    const nums = obj({ xs: arr({ type: "number" }) }, ["xs"]);
    expect(kindsOf(ints, nums).safe).toContain("type-widened");
    expect(kindsOf(nums, ints).breaking).toContain("type-narrowed");
  });

  it("changing the item type is breaking and reports the `[]` path", () => {
    const v = classifyChange(
      obj({ xs: arr({ type: "string" }) }, ["xs"]),
      obj({ xs: arr({ type: "number" }) }, ["xs"]),
    );
    expect(v.breaking.map((d) => d.kind)).toContain("type-changed");
    expect(v.breaking.map((d) => d.path)).toContain("xs[]");
  });

  it("tightening minItems is breaking; loosening it is safe", () => {
    const loose = obj({ xs: arr({ type: "string" }, { minItems: 0 }) }, ["xs"]);
    const tight = obj({ xs: arr({ type: "string" }, { minItems: 2 }) }, ["xs"]);
    expect(kindsOf(loose, tight).breaking).toContain("constraint-tightened");
    expect(kindsOf(tight, loose).safe).toContain("constraint-relaxed");
  });
});

describe("classifyChange — nested unions and node-kind changes", () => {
  it("a union nested in a field gains a variant safely, at the field path", () => {
    const small = obj(
      { v: { anyOf: [{ type: "string" }, { type: "number" }] } },
      ["v"],
    );
    const big = obj(
      { v: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] } },
      ["v"],
    );
    const v = classifyChange(small, big);
    expect(v.breaking).toHaveLength(0);
    expect(v.deltas.find((d) => d.kind === "type-widened")?.path).toBe("v");
  });

  it("losing a nested union variant is breaking at the field path", () => {
    const big = obj(
      { v: { anyOf: [{ type: "string" }, { type: "number" }] } },
      ["v"],
    );
    const small = obj({ v: { anyOf: [{ type: "string" }] } }, ["v"]);
    const v = classifyChange(big, small);
    expect(v.breaking.map((d) => d.path)).toContain("v");
    expect(v.breaking.map((d) => d.kind)).toContain("type-narrowed");
  });

  it("swapping an object field for a primitive is a breaking node-kind change", () => {
    const r = kindsOf(
      obj({ v: obj({ x: { type: "string" } }, ["x"]) }, ["v"]),
      obj({ v: { type: "string" } }, ["v"]),
    );
    expect(r.breaking).toContain("type-changed");
  });

  it("two unrecognised object nodes collapse to a conservative breaking delta", () => {
    // `{const: …}` is neither object/array/union/primitive to nodeKind, so the
    // comparison falls through to the conservative node-kind fallback.
    const r = kindsOf({ const: 1 }, { const: 2 });
    expect(r.breaking).toContain("type-changed");
  });

  it("a changed boolean-schema position is a breaking structure change", () => {
    // A JSON Schema property value may itself be a boolean (`true`/`false`);
    // such a non-object node is compared by canonical equality.
    const r = kindsOf(obj({ x: true }, []), obj({ x: false }, []));
    expect(r.breaking).toContain("structure-changed");
  });

  it("an identical unrecognised shape yields no delta", () => {
    const v = classifyChange({ const: 1 }, { const: 1 });
    expect(v.deltas).toHaveLength(0);
  });
});

describe("classifyChange — $ref nodes (opaque, unresolved)", () => {
  it("a changed $ref is conservatively breaking", () => {
    const r = kindsOf(
      obj({ a: { $ref: "#/$defs/Foo" } }, ["a"]),
      obj({ a: { $ref: "#/$defs/Bar" } }, ["a"]),
    );
    expect(r.breaking).toContain("structure-changed");
  });

  it("an unchanged $ref carries no delta", () => {
    const same = obj({ a: { $ref: "#" } }, ["a"]);
    expect(classifyChange(same, structuredClone(same)).deltas).toHaveLength(0);
  });

  it("a sibling change next to a self-ref is still caught at the root", () => {
    // Zod renders `z.lazy` recursion as `{ $ref: "#" }`; a breaking change to a
    // non-recursive sibling field is still diffed at the root it points back to.
    const node = (t: string) => ({
      type: "object",
      properties: { value: { type: t }, nested: { $ref: "#" } },
      required: ["value"],
      additionalProperties: false,
    });
    expect(kindsOf(node("string"), node("number")).breaking).toContain("type-changed");
  });

  it("KNOWN LIMITATION: a change behind an unchanged $defs ref is not detected", () => {
    // Documents the boundary deliberately left open: resolving JSON pointers is
    // out of scope because it is unreachable (no metadata registry is ever
    // passed to z.toJSONSchema, so $defs refs are never emitted).
    const prev = {
      type: "object",
      properties: { a: { $ref: "#/$defs/Foo" } },
      $defs: { Foo: { type: "string" } },
    };
    const next = {
      type: "object",
      properties: { a: { $ref: "#/$defs/Foo" } },
      $defs: { Foo: { type: "number" } },
    };
    expect(classifyChange(prev, next).breaking).toHaveLength(0);
  });
});

describe("classifyChange — discriminated unions", () => {
  const variant = (
    k: string,
    props: Record<string, unknown> = {},
    required: string[] = [],
  ) => ({
    type: "object",
    properties: { kind: { const: k }, ...props },
    required: ["kind", ...required],
    additionalProperties: false,
  });

  it("adding an optional field inside a variant is safe, not a replaced variant", () => {
    const prev = { oneOf: [variant("A"), variant("B")] };
    const next = {
      oneOf: [variant("A", { extra: { type: "string" } }), variant("B")],
    };
    const r = kindsOf(prev, next);
    expect(r.breaking).toEqual([]);
    expect(r.safe).toContain("field-added-optional");
  });

  it("dropping a variant is breaking; adding one is safe", () => {
    const ab = { oneOf: [variant("A"), variant("B")] };
    const abc = { oneOf: [variant("A"), variant("B"), variant("C")] };
    expect(kindsOf(abc, ab).breaking).toContain("type-narrowed");
    expect(kindsOf(ab, abc).safe).toContain("type-widened");
  });

  it("narrowing a field inside a matched variant is breaking at the field path", () => {
    const prev = {
      oneOf: [variant("A", { n: { type: "number" } }, ["n"]), variant("B")],
    };
    const next = {
      oneOf: [variant("A", { n: { type: "integer" } }, ["n"]), variant("B")],
    };
    const v = classifyChange(prev, next);
    expect(v.breaking.map((d) => d.kind)).toContain("type-narrowed");
    expect(v.breaking.map((d) => d.path)).toContain("n");
  });

  it("falls back to set comparison for primitive (non-discriminated) unions", () => {
    const small = { anyOf: [{ type: "string" }, { type: "number" }] };
    const big = {
      anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
    };
    expect(kindsOf(small, big).safe).toContain("type-widened");
    expect(kindsOf(big, small).breaking).toContain("type-narrowed");
  });
});

describe("classifyChange — verdict partitioning", () => {
  it("separates safe and breaking deltas from a mixed diff", () => {
    // adds optional `c` (safe), drops required `b` (breaking) in one save.
    const v = classifyChange(
      obj({ a: { type: "string" }, b: { type: "string" } }, ["a", "b"]),
      obj({ a: { type: "string" }, c: { type: "number" } }, ["a"]),
    );
    expect(v.breaking.every((d) => d.breaking)).toBe(true);
    expect(v.breaking.map((d) => d.kind)).toContain("field-removed");
    expect(v.deltas.filter((d) => !d.breaking).map((d) => d.kind)).toContain(
      "field-added-optional",
    );
    // `breaking` is exactly the breaking subset of `deltas`.
    expect(v.breaking).toEqual(v.deltas.filter((d) => d.breaking));
  });
});

describe("ArtifactSchemaBreakingChangeError", () => {
  it("spells out each breaking delta and the remediation", () => {
    const v = classifyChange(
      obj({ a: { type: "string" }, b: { type: "string" } }, ["a", "b"]),
      obj({ a: { type: "string" } }, ["a"]),
    );
    const err = new ArtifactSchemaBreakingChangeError(
      { id: "Brief", version: "v1", name: "Brief" },
      v.breaking,
    );
    expect(err.message).toContain("Brief (Brief@v1)");
    expect(err.message).toContain("`b` removed");
    expect(err.message).toContain("allow breaking change");
  });
});

describe("classifyCoercionChain", () => {
  const node = (
    version: string,
    simplifiedSchema: unknown,
    opts: { sample?: unknown; coerceFrom?: CoerceFrom } = {},
  ): CoercionChainNode => ({
    version,
    simplifiedSchema,
    schema: z.fromJSONSchema(simplifiedSchema as never),
    sample: opts.sample ?? null,
    coerceFrom: opts.coerceFrom ?? null,
  });

  /** Build a resolver over a fixed set of ancestor nodes (id is implicit). */
  const ancestors =
    (...nodes: CoercionChainNode[]) =>
    (version: string): CoercionChainNode | null =>
      nodes.find((n) => n.version === version) ?? null;

  const incomingOf = (n: CoercionChainNode) => ({
    version: n.version,
    simplifiedSchema: n.simplifiedSchema,
    schema: n.schema,
    sample: n.sample,
    coerceFrom: n.coerceFrom,
  });

  const rename = (from: string, at: string): CoerceFrom["patch"] => [
    { op: "rename", from, at },
  ];

  it("passes a sound single hop (the common bump-with-coercion case)", () => {
    const v1 = node("v1", obj({ summary: { type: "string" } }, ["summary"]), {
      sample: { summary: "x" },
    });
    const v2 = node("v2", obj({ abstract: { type: "string" } }, ["abstract"]), {
      coerceFrom: { fromVersion: "v1", patch: rename("summary", "abstract") },
    });
    const verdict = classifyCoercionChain(incomingOf(v2), ancestors(v1));
    expect(verdict.broken).toHaveLength(0);
    expect(verdict.hops.map((h) => h.status)).toEqual(["ok"]);
  });

  it("passes a sound 3-version chain (rename then rename)", () => {
    const v1 = node("v1", obj({ a: { type: "string" } }, ["a"]), { sample: { a: "x" } });
    const v2 = node("v2", obj({ b: { type: "string" } }, ["b"]), {
      sample: { b: "x" },
      coerceFrom: { fromVersion: "v1", patch: rename("a", "b") },
    });
    const v3 = node("v3", obj({ c: { type: "string" } }, ["c"]), {
      coerceFrom: { fromVersion: "v2", patch: rename("b", "c") },
    });
    const verdict = classifyCoercionChain(incomingOf(v3), ancestors(v1, v2));
    expect(verdict.broken).toHaveLength(0);
  });

  it("rejects a hop whose patch fails to produce the target's required field", () => {
    const v1 = node("v1", obj({ summary: { type: "string" } }, ["summary"]), {
      sample: { summary: "x" },
    });
    // @v2 requires `abstract` but the patch is a no-op that never produces it.
    const v2 = node("v2", obj({ abstract: { type: "string" } }, ["abstract"]), {
      coerceFrom: { fromVersion: "v1", patch: [{ op: "set", at: "noop", value: 1 }] },
    });
    const verdict = classifyCoercionChain(incomingOf(v2), ancestors(v1));
    expect(verdict.broken).toHaveLength(1);
    expect(verdict.broken[0].fromVersion).toBe("v1");
  });

  it("catches the lossy composition (rename then unset drops data the target needs)", () => {
    // skeptic #3: v1{a} --rename a→b--> v2 --unset b--> v3, but v3 requires `title`.
    // Reading a v1 (or v2) artifact as v3 composes to {} → fails the v3 schema.
    const v1 = node("v1", obj({ a: { type: "string" } }, ["a"]), { sample: { a: "x" } });
    const v2 = node("v2", obj({ b: { type: "string" } }, ["b"]), {
      sample: { b: "x" },
      coerceFrom: { fromVersion: "v1", patch: rename("a", "b") },
    });
    const v3 = node("v3", obj({ title: { type: "string" } }, ["title"]), {
      coerceFrom: { fromVersion: "v2", patch: [{ op: "unset", at: "b" }] },
    });
    const verdict = classifyCoercionChain(incomingOf(v3), ancestors(v1, v2));
    expect(verdict.broken.length).toBeGreaterThan(0);
    // The direct culprit hop (v2 → v3) is reported.
    expect(verdict.broken.some((h) => h.fromVersion === "v2")).toBe(true);
  });

  it("blocks on a provable schema hole even with no stored sample", () => {
    const v1 = node("v1", obj({ summary: { type: "string" } }, ["summary"])); // no sample
    const v2 = node("v2", obj({ abstract: { type: "string" } }, ["abstract"]), {
      coerceFrom: { fromVersion: "v1", patch: [] }, // empty patch — summary never becomes abstract
    });
    const verdict = classifyCoercionChain(incomingOf(v2), ancestors(v1));
    expect(verdict.broken).toHaveLength(1);
  });

  it("degrades (does not block) when a clean chain has no sample to dry-run", () => {
    const v1 = node("v1", obj({ summary: { type: "string" } }, ["summary"])); // no sample
    const v2 = node("v2", obj({ abstract: { type: "string" } }, ["abstract"]), {
      coerceFrom: { fromVersion: "v1", patch: rename("summary", "abstract") },
    });
    const verdict = classifyCoercionChain(incomingOf(v2), ancestors(v1));
    expect(verdict.broken).toHaveLength(0);
    expect(verdict.degraded).toHaveLength(1);
  });

  it("degrades on a stale sample (invalid under its own schema), never false-passing", () => {
    const v1 = node("v1", obj({ summary: { type: "string" } }, ["summary"]), {
      sample: { wrong: 1 }, // does not validate under v1's own schema
    });
    const v2 = node("v2", obj({ abstract: { type: "string" } }, ["abstract"]), {
      coerceFrom: { fromVersion: "v1", patch: rename("summary", "abstract") },
    });
    const verdict = classifyCoercionChain(incomingOf(v2), ancestors(v1));
    // Stale sample is ignored; schema-sim is clean → degraded, not broken.
    expect(verdict.broken).toHaveLength(0);
    expect(verdict.degraded).toHaveLength(1);
  });

  it("aborts a cycle instead of looping", () => {
    const v1 = node("v1", obj({ a: { type: "string" } }, ["a"]), {
      coerceFrom: { fromVersion: "v2", patch: rename("b", "a") },
    });
    const v2incoming = {
      version: "v2",
      simplifiedSchema: obj({ b: { type: "string" } }, ["b"]),
      schema: z.fromJSONSchema(obj({ b: { type: "string" } }, ["b"]) as never),
      sample: null,
      coerceFrom: { fromVersion: "v1", patch: rename("a", "b") },
    };
    const verdict = classifyCoercionChain(v2incoming, ancestors(v1));
    expect(verdict.broken.some((h) => /cycle/i.test(h.reason))).toBe(true);
  });

  it("degrades (does not block) on a missing declared predecessor", () => {
    // A single adjacent coercion still fires at read time without the
    // predecessor's schema, so an unregistered predecessor is unverifiable, not
    // unsound — degrade rather than over-gate.
    const v2 = node("v2", obj({ abstract: { type: "string" } }, ["abstract"]), {
      coerceFrom: { fromVersion: "v1", patch: rename("summary", "abstract") },
    });
    const verdict = classifyCoercionChain(incomingOf(v2), ancestors()); // no v1
    expect(verdict.broken).toHaveLength(0);
    expect(verdict.degraded).toHaveLength(1);
    expect(verdict.degraded[0].reason).toMatch(/not registered/);
  });

  it("returns no hops when nothing declares a coercion", () => {
    const v2 = node("v2", obj({ abstract: { type: "string" } }, ["abstract"]));
    expect(classifyCoercionChain(incomingOf(v2), ancestors())).toEqual({
      hops: [],
      broken: [],
      degraded: [],
    });
  });
});

describe("ArtifactSchemaChainUnsoundError", () => {
  it("lists each broken hop and the remediation, IPC-safe", () => {
    const err = new ArtifactSchemaChainUnsoundError(
      { id: "Brief", version: "v2", name: "Brief" },
      [
        {
          fromVersion: "v1",
          toVersion: "v2",
          status: "broken",
          reason: "a @v1 payload coerced to @v2 no longer validates against the @v2 schema",
        },
      ],
    );
    expect(err.message).toContain("Brief (Brief@v2)");
    expect(err.message).toContain("Brief@v1 → @v2");
    expect(err.message).toContain("allow breaking change");
  });
});
