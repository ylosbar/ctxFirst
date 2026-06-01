import { describe, expect, it } from "vitest";
import { makeDeleteArtifactSchema } from "./delete-artifact-schema";
import { createFakeArtifactSchemaRegistry } from "../../__tests__/fixtures/fake-registries";

describe("deleteArtifactSchema use-case", () => {
  it("removes an existing user artifact type", async () => {
    const artifactSchemas = createFakeArtifactSchemaRegistry();
    await artifactSchemas.save({
      id: "Foo",
      version: "v1",
      name: "Foo",
      simplifiedSchema: { type: "object" },
    });
    expect(artifactSchemas.resolve("user:Foo@v1")).not.toBeNull();

    const remove = makeDeleteArtifactSchema({ artifactSchemas });
    await remove({ id: "Foo", version: "v1" });
    expect(artifactSchemas.resolve("user:Foo@v1")).toBeNull();
  });

  it("is idempotent on an absent ref", async () => {
    const artifactSchemas = createFakeArtifactSchemaRegistry();
    const remove = makeDeleteArtifactSchema({ artifactSchemas });
    await expect(remove({ id: "Ghost", version: "v1" })).resolves.toBeUndefined();
  });

  it("rejects an invalid ref", async () => {
    const artifactSchemas = createFakeArtifactSchemaRegistry();
    const remove = makeDeleteArtifactSchema({ artifactSchemas });
    await expect(remove({ id: "", version: "v1" })).rejects.toThrow(
      /requires id and version/,
    );
    await expect(remove({ id: "x", version: "" })).rejects.toThrow(
      /requires id and version/,
    );
  });
});
