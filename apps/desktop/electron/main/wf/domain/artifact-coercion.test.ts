import { describe, expect, it } from "vitest";
import {
  applyDeclarativePatch,
  parseCoerceFromColumn,
  validateCoerceFrom,
  validateDeclarativePatch,
  type DeclarativePatch,
} from "./artifact-coercion";

describe("applyDeclarativePatch", () => {
  it("returns the payload unchanged for an empty patch", () => {
    const payload = { a: 1 };
    expect(applyDeclarativePatch(payload, [])).toEqual({ a: 1 });
  });

  it("does not mutate the input payload", () => {
    const payload = { a: 1 };
    applyDeclarativePatch(payload, [{ op: "set", at: "a", value: 2 }]);
    expect(payload).toEqual({ a: 1 });
  });

  it("set overwrites an existing value and creates a missing one", () => {
    expect(
      applyDeclarativePatch({ a: 1 }, [{ op: "set", at: "a", value: 9 }]),
    ).toEqual({ a: 9 });
    expect(
      applyDeclarativePatch({ a: 1 }, [{ op: "set", at: "b", value: 2 }]),
    ).toEqual({ a: 1, b: 2 });
  });

  it("setIfMissing only fills an absent key", () => {
    expect(
      applyDeclarativePatch({ a: 1 }, [
        { op: "setIfMissing", at: "a", value: 9 },
      ]),
    ).toEqual({ a: 1 });
    expect(
      applyDeclarativePatch({ a: 1 }, [
        { op: "setIfMissing", at: "b", value: 2 },
      ]),
    ).toEqual({ a: 1, b: 2 });
  });

  it("unset removes a key and is a no-op when absent", () => {
    expect(
      applyDeclarativePatch({ a: 1, b: 2 }, [{ op: "unset", at: "b" }]),
    ).toEqual({ a: 1 });
    expect(
      applyDeclarativePatch({ a: 1 }, [{ op: "unset", at: "z" }]),
    ).toEqual({ a: 1 });
  });

  it("rename moves a value and drops the source", () => {
    expect(
      applyDeclarativePatch({ summary: "hi", keep: 1 }, [
        { op: "rename", from: "summary", at: "abstract" },
      ]),
    ).toEqual({ abstract: "hi", keep: 1 });
  });

  it("rename is a no-op when the source is absent", () => {
    expect(
      applyDeclarativePatch({ keep: 1 }, [
        { op: "rename", from: "summary", at: "abstract" },
      ]),
    ).toEqual({ keep: 1 });
  });

  it("supports nested dotted paths, creating intermediate objects", () => {
    expect(
      applyDeclarativePatch({ meta: { a: 1 } }, [
        { op: "set", at: "meta.b", value: 2 },
        { op: "set", at: "deep.nested.x", value: 3 },
      ]),
    ).toEqual({ meta: { a: 1, b: 2 }, deep: { nested: { x: 3 } } });
  });

  it("applies ops left to right", () => {
    expect(
      applyDeclarativePatch({ a: 1 }, [
        { op: "set", at: "b", value: 2 },
        { op: "rename", from: "b", at: "c" },
      ]),
    ).toEqual({ a: 1, c: 2 });
  });

  it("is idempotent: applying twice equals applying once", () => {
    const patch: DeclarativePatch = [
      { op: "rename", from: "summary", at: "abstract" },
      { op: "setIfMissing", at: "priority", value: "normal" },
      { op: "unset", at: "legacy" },
    ];
    const once = applyDeclarativePatch(
      { summary: "x", legacy: true },
      patch,
    );
    const twice = applyDeclarativePatch(once, patch);
    expect(twice).toEqual(once);
    expect(once).toEqual({ abstract: "x", priority: "normal" });
  });

  it("throws on a non-object payload when the patch is non-empty", () => {
    expect(() =>
      applyDeclarativePatch("nope", [{ op: "set", at: "a", value: 1 }]),
    ).toThrow(/expects an object payload/);
  });

  it("throws when a write is blocked by a non-object on the path", () => {
    expect(() =>
      applyDeclarativePatch({ a: "scalar" }, [
        { op: "set", at: "a.b", value: 1 },
      ]),
    ).toThrow(/blocked by a non-object/);
  });
});

describe("validateDeclarativePatch", () => {
  it("accepts a well-formed patch", () => {
    const patch = [
      { op: "set", at: "a", value: 1 },
      { op: "rename", from: "x", at: "y" },
    ];
    expect(validateDeclarativePatch(patch)).toEqual(patch);
  });

  it("rejects a non-array", () => {
    expect(() => validateDeclarativePatch({})).toThrow(/must be an array/);
  });

  it("rejects an unknown op", () => {
    expect(() =>
      validateDeclarativePatch([{ op: "delete", at: "a" }]),
    ).toThrow(/must be one of/);
  });

  it("rejects a missing 'at'", () => {
    expect(() =>
      validateDeclarativePatch([{ op: "set", value: 1 }]),
    ).toThrow(/non-empty "at"/);
  });

  it("rejects a rename without 'from'", () => {
    expect(() =>
      validateDeclarativePatch([{ op: "rename", at: "y" }]),
    ).toThrow(/non-empty "from"/);
  });

  it("rejects a set without 'value'", () => {
    expect(() =>
      validateDeclarativePatch([{ op: "set", at: "a" }]),
    ).toThrow(/requires a "value"/);
  });

  it("accepts a set with an explicit null value", () => {
    expect(
      validateDeclarativePatch([{ op: "set", at: "a", value: null }]),
    ).toEqual([{ op: "set", at: "a", value: null }]);
  });
});

describe("validateCoerceFrom / parseCoerceFromColumn", () => {
  it("validates a well-formed coerceFrom", () => {
    const cf = { fromVersion: "v1", patch: [{ op: "unset", at: "a" }] };
    expect(validateCoerceFrom(cf)).toEqual(cf);
  });

  it("rejects an empty fromVersion", () => {
    expect(() =>
      validateCoerceFrom({ fromVersion: "", patch: [] }),
    ).toThrow(/fromVersion/);
  });

  it("round-trips through the column codec", () => {
    const cf = { fromVersion: "v1", patch: [{ op: "set", at: "a", value: 1 }] };
    expect(parseCoerceFromColumn(JSON.stringify(cf))).toEqual(cf);
  });

  it("returns null for null/empty/corrupt column content", () => {
    expect(parseCoerceFromColumn(null)).toBeNull();
    expect(parseCoerceFromColumn("")).toBeNull();
    expect(parseCoerceFromColumn("{not json")).toBeNull();
    expect(parseCoerceFromColumn(JSON.stringify({ patch: [] }))).toBeNull();
  });
});
