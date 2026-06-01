import { describe, expect, it } from "vitest";
import { makeListArtifactSchemas } from "./list-artifact-schemas";
import { createFakeArtifactSchemaRegistry } from "../../__tests__/fixtures/fake-registries";

describe("listArtifactSchemas use-case", () => {
  it("forwards to the registry — includes builtins and user types", async () => {
    const artifactSchemas = createFakeArtifactSchemaRegistry();
    await artifactSchemas.save({
      id: "Foo",
      version: "v1",
      name: "Foo",
      simplifiedSchema: { type: "object" },
    });
    const list = makeListArtifactSchemas({ artifactSchemas });
    const all = await list();
    expect(all.find((r) => r.id === "Foo")).toBeDefined();
    expect(all.some((r) => r.source.kind === "builtin")).toBe(true);
  });
});
