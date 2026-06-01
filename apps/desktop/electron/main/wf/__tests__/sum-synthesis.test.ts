import { describe, expect, it } from "vitest";

import {
  ArtifactSchemaError,
  UnknownArtifactKindError,
} from "../domain/artifact-errors";
import { parseArtifact } from "../domain/parse-artifact";
import { createFakeArtifactSchemaRegistry } from "./fixtures/fake-registries";

/**
 * §4 acceptance — `OneOf<…>`, `Success<T>`, `Error<E>` are synthesised by the
 * fake registry exactly as the SQLite adapter does. Tests exercise both the
 * grammar/schema layer (parse+resolve) and the recursive validation of the
 * resulting discriminated union.
 */
describe("registry — OneOf<…> synthesis", () => {
  it("synthesises a sum descriptor flagged as synthesized", () => {
    const registry = createFakeArtifactSchemaRegistry();
    const desc = registry.resolve("OneOf<Markdown,LinearRef>");
    expect(desc).not.toBeNull();
    expect(desc?.kind).toBe("OneOf<Markdown,LinearRef>");
    expect(desc?.synthesized).toBe(true);
    expect(desc?.source).toEqual({ kind: "builtin" });
  });

  it("validates a {variantKind, payload} envelope on each variant", () => {
    const registry = createFakeArtifactSchemaRegistry();
    expect(
      parseArtifact(registry, "OneOf<Markdown,LinearRef>", {
        variantKind: "Markdown",
        payload: { format: "markdown", body: "x" },
      }),
    ).toEqual({
      variantKind: "Markdown",
      payload: { format: "markdown", body: "x" },
    });
    expect(
      parseArtifact(registry, "OneOf<Markdown,LinearRef>", {
        variantKind: "LinearRef",
        payload: { value: "ABC-1" },
      }),
    ).toEqual({ variantKind: "LinearRef", payload: { value: "ABC-1" } });
  });

  it("rejects an envelope whose variantKind is not in the sum", () => {
    const registry = createFakeArtifactSchemaRegistry();
    expect(() =>
      parseArtifact(registry, "OneOf<Markdown,LinearRef>", {
        variantKind: "Path",
        payload: { path: "/tmp/x" },
      }),
    ).toThrow(ArtifactSchemaError);
  });

  it("rejects an envelope whose payload violates the variant schema", () => {
    const registry = createFakeArtifactSchemaRegistry();
    expect(() =>
      parseArtifact(registry, "OneOf<Markdown,LinearRef>", {
        variantKind: "LinearRef",
        payload: { value: "not-a-linear-ref" },
      }),
    ).toThrow(ArtifactSchemaError);
  });

  it("memoises sum descriptors across resolves (cache hit)", () => {
    const registry = createFakeArtifactSchemaRegistry();
    const a = registry.resolve("OneOf<Markdown,LinearRef>");
    const b = registry.resolve("OneOf<Markdown,LinearRef>");
    expect(a).toBe(b);
  });

  it("throws UnknownArtifactKindError when a variant does not resolve", () => {
    const registry = createFakeArtifactSchemaRegistry();
    expect(() =>
      registry.resolve("OneOf<Markdown,user:missing@v1>"),
    ).toThrow(UnknownArtifactKindError);
  });

  it("invalidates the sum descriptor when a constituent user record changes", async () => {
    const registry = createFakeArtifactSchemaRegistry();
    await registry.save({
      id: "ticket",
      version: "v1",
      name: "Ticket",
      simplifiedSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    });
    const before = registry.resolve("OneOf<Markdown,user:ticket@v1>");
    expect(before?.synthesized).toBe(true);
    await registry.save({
      id: "ticket",
      version: "v1",
      name: "Ticket (renamed)",
      simplifiedSchema: {
        type: "object",
        properties: { id: { type: "string" }, label: { type: "string" } },
        required: ["id", "label"],
      },
    });
    const after = registry.resolve("OneOf<Markdown,user:ticket@v1>");
    expect(after).not.toBe(before);
  });
});

describe("registry — Success<T> / Error<E> synthesis", () => {
  it("synthesises Success<Markdown> with the literal discriminator", () => {
    const registry = createFakeArtifactSchemaRegistry();
    const desc = registry.resolve("Success<Markdown>");
    expect(desc?.synthesized).toBe(true);
    expect(
      parseArtifact(registry, "Success<Markdown>", {
        variant: "Success",
        value: { format: "markdown", body: "yes" },
      }),
    ).toEqual({
      variant: "Success",
      value: { format: "markdown", body: "yes" },
    });
    expect(() =>
      parseArtifact(registry, "Success<Markdown>", {
        variant: "Error",
        value: { format: "markdown", body: "no" },
      }),
    ).toThrow(ArtifactSchemaError);
  });

  it("synthesises Error<E> independently", () => {
    const registry = createFakeArtifactSchemaRegistry();
    expect(
      parseArtifact(registry, "Error<Markdown>", {
        variant: "Error",
        value: { format: "markdown", body: "boom" },
      }),
    ).toEqual({
      variant: "Error",
      value: { format: "markdown", body: "boom" },
    });
  });

  it("can be combined into OneOf<Success<T>,Error<E>>", () => {
    const registry = createFakeArtifactSchemaRegistry();
    const sum = registry.resolve("OneOf<Success<Markdown>,Error<Markdown>>");
    expect(sum?.synthesized).toBe(true);
    // Success branch.
    expect(
      parseArtifact(registry, "OneOf<Success<Markdown>,Error<Markdown>>", {
        variantKind: "Success<Markdown>",
        payload: {
          variant: "Success",
          value: { format: "markdown", body: "ok" },
        },
      }),
    ).toBeTruthy();
    // Error branch.
    expect(
      parseArtifact(registry, "OneOf<Success<Markdown>,Error<Markdown>>", {
        variantKind: "Error<Markdown>",
        payload: {
          variant: "Error",
          value: { format: "markdown", body: "ko" },
        },
      }),
    ).toBeTruthy();
  });
});
