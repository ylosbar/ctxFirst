import { describe, expect, it } from "vitest";
import { makeSaveArtifactSchema } from "./save-artifact-schema";
import { createFakeArtifactSchemaRegistry } from "../../__tests__/fixtures/fake-registries";

const buildDeps = () => {
  const artifactSchemas = createFakeArtifactSchemaRegistry();
  return { artifactSchemas, save: makeSaveArtifactSchema({ artifactSchemas }) };
};

const validInput = (
  over: Partial<Parameters<ReturnType<typeof makeSaveArtifactSchema>>[0]> = {},
) => ({
  id: "Foo",
  version: "v1",
  name: "Foo",
  description: "",
  rawSchema: null,
  simplifiedSchema: { type: "object" },
  sampleRaw: null,
  ...over,
});

describe("saveArtifactSchema use-case", () => {
  it("persists a valid user artifact type", async () => {
    const { artifactSchemas, save } = buildDeps();
    await save(validInput());
    const record = artifactSchemas.resolve("user:Foo@v1");
    expect(record).not.toBeNull();
    expect(record?.name).toBe("Foo");
  });

  it("trims id/version/name", async () => {
    const { artifactSchemas, save } = buildDeps();
    await save(validInput({ id: "  Foo  ", version: " v1 ", name: "  Foo  " }));
    expect(artifactSchemas.resolve("user:Foo@v1")).not.toBeNull();
  });

  it("rejects an empty id", async () => {
    const { save } = buildDeps();
    await expect(save(validInput({ id: "  " }))).rejects.toThrow(
      /artifact type id is required/,
    );
  });

  it("rejects an empty version", async () => {
    const { save } = buildDeps();
    await expect(save(validInput({ version: "" }))).rejects.toThrow(
      /artifact type version is required/,
    );
  });

  it("rejects an empty name", async () => {
    const { save } = buildDeps();
    await expect(save(validInput({ name: "" }))).rejects.toThrow(
      /artifact type name is required/,
    );
  });

  it("rejects a non-object simplifiedSchema", async () => {
    const { save } = buildDeps();
    await expect(
      save(validInput({ simplifiedSchema: "nope" })),
    ).rejects.toThrow(/simplifiedSchema must be a JSON Schema object/);
    await expect(
      save(validInput({ simplifiedSchema: [] })),
    ).rejects.toThrow(/simplifiedSchema must be a JSON Schema object/);
    await expect(
      save(validInput({ simplifiedSchema: null })),
    ).rejects.toThrow(/simplifiedSchema must be a JSON Schema object/);
  });
});

describe("saveArtifactSchema — BACKWARD gate", () => {
  const objSchema = (
    properties: Record<string, unknown>,
    required: string[] = [],
  ) => ({ type: "object", properties, required, additionalProperties: false });

  it("allows a first-ever save (no predecessor to break)", async () => {
    const { artifactSchemas, save } = buildDeps();
    await save(
      validInput({ simplifiedSchema: objSchema({ a: { type: "string" } }, ["a"]) }),
    );
    expect(artifactSchemas.resolve("user:Foo@v1")).not.toBeNull();
  });

  it("allows an additive in-place overwrite silently", async () => {
    const { save } = buildDeps();
    await save(
      validInput({ simplifiedSchema: objSchema({ a: { type: "string" } }, ["a"]) }),
    );
    await expect(
      save(
        validInput({
          simplifiedSchema: objSchema(
            { a: { type: "string" }, b: { type: "number" } },
            ["a"],
          ),
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a breaking in-place overwrite", async () => {
    const { save } = buildDeps();
    await save(
      validInput({
        simplifiedSchema: objSchema(
          { a: { type: "string" }, b: { type: "string" } },
          ["a", "b"],
        ),
      }),
    );
    await expect(
      save(
        validInput({ simplifiedSchema: objSchema({ a: { type: "string" } }, ["a"]) }),
      ),
    ).rejects.toThrow(/would break existing data/);
  });

  it("allows a breaking overwrite when allowBreaking is set", async () => {
    const { save } = buildDeps();
    await save(
      validInput({
        simplifiedSchema: objSchema(
          { a: { type: "string" }, b: { type: "string" } },
          ["a", "b"],
        ),
      }),
    );
    await expect(
      save(
        validInput({
          simplifiedSchema: objSchema({ a: { type: "string" } }, ["a"]),
          allowBreaking: true,
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("does not gate a bump to a new version (fresh identity)", async () => {
    const { artifactSchemas, save } = buildDeps();
    await save(
      validInput({
        version: "v1",
        simplifiedSchema: objSchema(
          { a: { type: "string" }, b: { type: "string" } },
          ["a", "b"],
        ),
      }),
    );
    // @v2 drops a required field vs @v1 — breaking as a diff, but a new
    // identity, so the gate must not fire.
    await expect(
      save(
        validInput({
          version: "v2",
          simplifiedSchema: objSchema({ a: { type: "string" } }, ["a"]),
        }),
      ),
    ).resolves.toBeUndefined();
    expect(artifactSchemas.resolve("user:Foo@v2")).not.toBeNull();
  });
});
