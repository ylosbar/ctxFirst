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

  it("persists a valid coerceFrom and rejects a malformed patch", async () => {
    const { artifactSchemas, save } = buildDeps();
    await save(
      validInput({
        version: "v2",
        coerceFrom: {
          fromVersion: "v1",
          patch: [{ op: "rename", from: "summary", at: "abstract" }],
        },
      }),
    );
    expect(artifactSchemas.resolve("user:Foo@v2")?.coerceFrom).toEqual({
      fromVersion: "v1",
      patch: [{ op: "rename", from: "summary", at: "abstract" }],
    });

    await expect(
      save(
        validInput({
          version: "v3",
          coerceFrom: {
            fromVersion: "v1",
            // Deliberately malformed op — the use-case must reject it at save.
            patch: [{ op: "bogus" as never, at: "a" }],
          },
        }),
      ),
    ).rejects.toThrow(/must be one of/);
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

describe("saveArtifactSchema — BACKWARD_TRANSITIVE chain gate", () => {
  const objSchema = (
    properties: Record<string, unknown>,
    required: string[] = [],
  ) => ({ type: "object", properties, required, additionalProperties: false });

  const saveBrief = async (
    save: ReturnType<typeof buildDeps>["save"],
    over: Parameters<typeof validInput>[0],
  ) => save(validInput({ id: "Brief", name: "Brief", ...over }));

  it("admits a bump whose declared coercion chain is sound", async () => {
    const { artifactSchemas, save } = buildDeps();
    await saveBrief(save, {
      version: "v1",
      simplifiedSchema: objSchema({ summary: { type: "string" } }, ["summary"]),
      sample: { summary: "hello" },
    });
    await expect(
      saveBrief(save, {
        version: "v2",
        simplifiedSchema: objSchema({ abstract: { type: "string" } }, ["abstract"]),
        coerceFrom: {
          fromVersion: "v1",
          patch: [{ op: "rename", from: "summary", at: "abstract" }],
        },
      }),
    ).resolves.toBeUndefined();
    expect(artifactSchemas.resolve("user:Brief@v2")?.coerceFrom).toEqual({
      fromVersion: "v1",
      patch: [{ op: "rename", from: "summary", at: "abstract" }],
    });
  });

  it("rejects a bump whose coercion patch can't produce the new required field", async () => {
    const { save } = buildDeps();
    await saveBrief(save, {
      version: "v1",
      simplifiedSchema: objSchema({ summary: { type: "string" } }, ["summary"]),
      sample: { summary: "hello" },
    });
    // @v2 requires `abstract`, but the patch never produces it.
    await expect(
      saveBrief(save, {
        version: "v2",
        simplifiedSchema: objSchema({ abstract: { type: "string" } }, ["abstract"]),
        coerceFrom: {
          fromVersion: "v1",
          patch: [{ op: "set", at: "noop", value: 1 }],
        },
      }),
    ).rejects.toThrow(/coercion chain that cannot read prior data/);
  });

  it("rejects the lossy rename-then-unset composition over 3 versions", async () => {
    const { save } = buildDeps();
    await saveBrief(save, {
      version: "v1",
      simplifiedSchema: objSchema({ a: { type: "string" } }, ["a"]),
      sample: { a: "x" },
    });
    await saveBrief(save, {
      version: "v2",
      simplifiedSchema: objSchema({ b: { type: "string" } }, ["b"]),
      sample: { b: "x" },
      coerceFrom: { fromVersion: "v1", patch: [{ op: "rename", from: "a", at: "b" }] },
    });
    // @v3 requires `title`; unset b drops everything, so reading v1/v2 as v3 fails.
    await expect(
      saveBrief(save, {
        version: "v3",
        simplifiedSchema: objSchema({ title: { type: "string" } }, ["title"]),
        coerceFrom: { fromVersion: "v2", patch: [{ op: "unset", at: "b" }] },
      }),
    ).rejects.toThrow(/cannot read prior data/);
  });

  it("allowBreaking bypasses the chain gate", async () => {
    const { save } = buildDeps();
    await saveBrief(save, {
      version: "v1",
      simplifiedSchema: objSchema({ summary: { type: "string" } }, ["summary"]),
      sample: { summary: "hello" },
    });
    await expect(
      saveBrief(save, {
        version: "v2",
        simplifiedSchema: objSchema({ abstract: { type: "string" } }, ["abstract"]),
        coerceFrom: {
          fromVersion: "v1",
          patch: [{ op: "set", at: "noop", value: 1 }],
        },
        allowBreaking: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not gate a plain bump that has no coerceFrom (anti-over-gating)", async () => {
    // The invariant that keeps this Framing-A, not Framing-B: a clean redesign
    // bump with NO coercion is never transitively gated.
    const { save } = buildDeps();
    await saveBrief(save, {
      version: "v1",
      simplifiedSchema: objSchema({ a: { type: "string" } }, ["a"]),
    });
    await expect(
      saveBrief(save, {
        version: "v2",
        simplifiedSchema: objSchema({ totally: { type: "string" } }, ["totally"]),
      }),
    ).resolves.toBeUndefined();
  });
});
