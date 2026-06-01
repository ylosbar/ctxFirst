import { describe, expect, it } from "vitest";
import {
  STRUCTURAL_HASH_SHORT_LEN,
  canonicalJson,
  composeListStructuralHash,
  computeStructuralHash,
  truncateStructuralHash,
} from "./artifact-schema-hash";
import type { ArtifactKind } from "./artifact";

const noParent = () => null;

describe("canonicalJson", () => {
  it("sorts object keys deterministically", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("preserves array order", () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it("normalises nested objects", () => {
    const a = canonicalJson({ outer: { z: 1, a: 2 }, list: [{ y: 3, x: 4 }] });
    const b = canonicalJson({ list: [{ x: 4, y: 3 }], outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it("collapses 1 and 1.0 (JSON number canonicalisation)", () => {
    expect(canonicalJson(1)).toBe(canonicalJson(1.0));
  });

  it("skips undefined values inside objects (JSON.stringify semantics)", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it("emits null for top-level undefined", () => {
    expect(canonicalJson(undefined)).toBe("null");
  });
});

describe("computeStructuralHash", () => {
  it("is deterministic for the same input", () => {
    const schema = { type: "object", properties: { v: { type: "string" } } };
    const a = computeStructuralHash({ simplifiedSchema: schema, extends: null }, noParent);
    const b = computeStructuralHash({ simplifiedSchema: schema, extends: null }, noParent);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes are insensitive to JSON key order", () => {
    const a = computeStructuralHash(
      { simplifiedSchema: { type: "object", properties: { v: { type: "string" } } }, extends: null },
      noParent,
    );
    const b = computeStructuralHash(
      { simplifiedSchema: { properties: { v: { type: "string" } }, type: "object" }, extends: null },
      noParent,
    );
    expect(a).toBe(b);
  });

  it("two records with the same schema collapse to the same hash", () => {
    const schema = { type: "object", properties: { v: { type: "string" } } };
    const userish = computeStructuralHash({ simplifiedSchema: schema, extends: null }, noParent);
    const pluginish = computeStructuralHash({ simplifiedSchema: schema, extends: null }, noParent);
    expect(userish).toBe(pluginish);
  });

  it("differs when extends differs even if local schema matches", () => {
    const schema = { type: "object", properties: { v: { type: "string" } } };
    const root = computeStructuralHash({ simplifiedSchema: schema, extends: null }, noParent);
    const refinement = computeStructuralHash(
      { simplifiedSchema: schema, extends: "String" as ArtifactKind },
      (k) => (k === "String" ? "parent-hash-deadbeef" : null),
    );
    expect(refinement).not.toBe(root);
  });

  it("treats unknown parent as null (graceful degradation)", () => {
    const schema = { type: "object" };
    const withMissingParent = computeStructuralHash(
      { simplifiedSchema: schema, extends: "Unknown" as ArtifactKind },
      () => null,
    );
    const withExplicitNullParent = computeStructuralHash(
      { simplifiedSchema: schema, extends: null },
      noParent,
    );
    // `extends: null` ⇒ {parent: null}, missing parent ⇒ {parent: null}.
    // Identical envelopes, identical hashes. The resolver gives us the same
    // bytes either way.
    expect(withMissingParent).toBe(withExplicitNullParent);
  });
});

describe("composeListStructuralHash", () => {
  it("derives from the inner hash, not the schema", () => {
    const inner = "abc123";
    const a = composeListStructuralHash(inner);
    const b = composeListStructuralHash(inner);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("two equivalent inner hashes ⇒ equivalent list hashes", () => {
    const inner = "deadbeefdeadbeef";
    expect(composeListStructuralHash(inner)).toBe(composeListStructuralHash(inner));
  });

  it("different inner hashes ⇒ different list hashes", () => {
    expect(composeListStructuralHash("aaaa")).not.toBe(
      composeListStructuralHash("bbbb"),
    );
  });

  it("never collides with a leaf hash of identical-looking payload", () => {
    // A leaf record whose schema canonicalises to {kind:"List", inner:"…"}
    // would still hash a different envelope ({schema, parent}) and thus
    // differ from a real list composition.
    const innerHash = "f".repeat(64);
    const listHash = composeListStructuralHash(innerHash);
    const leafLooksLikeList = computeStructuralHash(
      {
        simplifiedSchema: { kind: "List", inner: innerHash },
        extends: null,
      },
      noParent,
    );
    expect(listHash).not.toBe(leafLooksLikeList);
  });
});

describe("truncateStructuralHash", () => {
  it("returns the short prefix length", () => {
    const hash = "0".repeat(64);
    expect(truncateStructuralHash(hash)).toHaveLength(STRUCTURAL_HASH_SHORT_LEN);
  });

  it("is a prefix of the full hash", () => {
    const hash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    expect(hash.startsWith(truncateStructuralHash(hash))).toBe(true);
  });
});
