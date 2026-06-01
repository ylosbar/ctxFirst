import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  STRUCTURAL_HASH_SHORT_LEN,
  canonicalJson,
  computeStructuralHashAsync,
  truncateStructuralHash,
} from "./structural-hash";

// The whole point of this shared module is that the renderer's hash matches
// the main-process hash byte-for-byte. The main process uses node:crypto;
// here we cross-check the Web-Crypto path against the same `createHash` call
// so a drift between the two implementations surfaces at the unit level.
describe("structural-hash (shared)", () => {
  it("canonicalJson is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("canonicalJson is recursively key-order independent", () => {
    const a = canonicalJson({ outer: { z: 1, a: 2 }, list: [{ y: 3, x: 4 }] });
    const b = canonicalJson({ list: [{ x: 4, y: 3 }], outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it("truncateStructuralHash returns the short prefix length", () => {
    const hash = "a".repeat(64);
    expect(truncateStructuralHash(hash)).toHaveLength(STRUCTURAL_HASH_SHORT_LEN);
  });

  it("computeStructuralHashAsync matches node:crypto over the same canonical bytes", async () => {
    const schema = { type: "object", properties: { v: { type: "string" } } };
    const nodeHash = createHash("sha256")
      .update(canonicalJson({ schema, parent: null }))
      .digest("hex");
    const webHash = await computeStructuralHashAsync(
      { simplifiedSchema: schema, extends: null },
      () => null,
    );
    expect(webHash).toBe(nodeHash);
  });

  it("computeStructuralHashAsync threads the parent's hash through the resolver", async () => {
    const schema = { type: "object" };
    const child = await computeStructuralHashAsync(
      { simplifiedSchema: schema, extends: "Root" },
      (kind) => (kind === "Root" ? "ROOT_HASH" : null),
    );
    const expected = createHash("sha256")
      .update(canonicalJson({ schema, parent: "ROOT_HASH" }))
      .digest("hex");
    expect(child).toBe(expected);
  });

  it("computeStructuralHashAsync accepts an async resolver", async () => {
    const schema = { type: "object" };
    const child = await computeStructuralHashAsync(
      { simplifiedSchema: schema, extends: "Root" },
      async (kind) => (kind === "Root" ? "P" : null),
    );
    const expected = createHash("sha256")
      .update(canonicalJson({ schema, parent: "P" }))
      .digest("hex");
    expect(child).toBe(expected);
  });
});
