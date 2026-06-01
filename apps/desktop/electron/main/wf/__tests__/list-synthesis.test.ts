import { describe, expect, it } from "vitest";

import {
  ArtifactSchemaError,
  UnknownArtifactKindError,
} from "../domain/artifact-errors";
import { parseArtifact } from "../domain/parse-artifact";
import { createFakeArtifactSchemaRegistry } from "./fixtures/fake-registries";

/**
 * §1 acceptance — `List<T>` synthesis is exercised against the in-memory
 * fake registry, which mirrors the SQLite adapter's resolve / synthesis /
 * cache-invalidation behaviour. The production adapter cannot be loaded in
 * the Node vitest environment because `better-sqlite3` is built against
 * the Electron ABI by the postinstall step.
 */
describe("registry — List<T> synthesis", () => {
  it("synthesises a descriptor for `List<Markdown>` flagged as synthesized", () => {
    const registry = createFakeArtifactSchemaRegistry();
    const desc = registry.resolve("List<Markdown>");
    expect(desc).not.toBeNull();
    expect(desc?.kind).toBe("List<Markdown>");
    expect(desc?.synthesized).toBe(true);
    expect(desc?.source).toEqual({ kind: "builtin" });
  });

  it("validates `{items: [<Markdown>]}` payloads", () => {
    const registry = createFakeArtifactSchemaRegistry();
    expect(
      parseArtifact(registry, "List<Markdown>", {
        items: [
          { format: "markdown", body: "a" },
          { format: "markdown", body: "b" },
        ],
      }),
    ).toEqual({
      items: [
        { format: "markdown", body: "a" },
        { format: "markdown", body: "b" },
      ],
    });
  });

  it("rejects payloads whose inner items violate the element schema", () => {
    const registry = createFakeArtifactSchemaRegistry();
    expect(() =>
      parseArtifact(registry, "List<Markdown>", { items: [{ body: "x" }] }),
    ).toThrow(ArtifactSchemaError);
  });

  it("supports nested lists end-to-end", () => {
    const registry = createFakeArtifactSchemaRegistry();
    const desc = registry.resolve("List<List<Path>>");
    expect(desc?.synthesized).toBe(true);
    expect(
      parseArtifact(registry, "List<List<Path>>", {
        items: [{ items: [{ path: "/tmp/a" }] }, { items: [] }],
      }),
    ).toBeTruthy();
  });

  it("memoises descriptors across resolves (cache hit)", () => {
    const registry = createFakeArtifactSchemaRegistry();
    const a = registry.resolve("List<Markdown>");
    const b = registry.resolve("List<Markdown>");
    expect(a).toBe(b);
  });

  it("invalidates the synthesised cache when a user record changes", async () => {
    const registry = createFakeArtifactSchemaRegistry();
    await registry.save({
      id: "shopify-order",
      version: "v1",
      name: "Shopify order",
      simplifiedSchema: {
        type: "object",
        properties: { sku: { type: "string" } },
        required: ["sku"],
      },
    });
    const before = registry.resolve("List<user:shopify-order@v1>");
    expect(before?.synthesized).toBe(true);
    await registry.save({
      id: "shopify-order",
      version: "v1",
      name: "Shopify order (renamed)",
      simplifiedSchema: {
        type: "object",
        properties: { sku: { type: "string" }, qty: { type: "number" } },
        required: ["sku", "qty"],
      },
    });
    const after = registry.resolve("List<user:shopify-order@v1>");
    expect(after).not.toBe(before);
    expect(after?.synthesized).toBe(true);
  });

  it("throws UnknownArtifactKindError when the inner kind does not resolve", () => {
    const registry = createFakeArtifactSchemaRegistry();
    expect(() => registry.resolve("List<user:missing@v1>")).toThrow(
      UnknownArtifactKindError,
    );
  });
});
