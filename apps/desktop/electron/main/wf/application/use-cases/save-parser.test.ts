import { describe, expect, it } from "vitest";
import { makeSaveParser } from "./save-parser";
import { createFakeParserRegistry } from "../../__tests__/fixtures/fake-registries";

const buildDeps = () => {
  const parsers = createFakeParserRegistry();
  return { parsers, save: makeSaveParser({ parsers }) };
};

const valid = (
  over: Partial<Parameters<ReturnType<typeof makeSaveParser>>[0]> = {},
) => ({
  id: "p1",
  version: "v1",
  forType: { id: "Foo", version: "v1" },
  mode: "declarative" as const,
  body: { operations: [] },
  meta: {},
  ...over,
});

describe("saveParser use-case", () => {
  it("persists a valid declarative parser", async () => {
    const { parsers, save } = buildDeps();
    await save(valid());
    const got = parsers.resolve({ id: "p1", version: "v1" });
    expect(got).not.toBeNull();
    expect(got?.mode).toBe("declarative");
  });

  it("trims id/version", async () => {
    const { parsers, save } = buildDeps();
    await save(valid({ id: "  p1 ", version: "  v1  " }));
    expect(parsers.resolve({ id: "p1", version: "v1" })).not.toBeNull();
  });

  it("rejects an empty id", async () => {
    const { save } = buildDeps();
    await expect(save(valid({ id: "" }))).rejects.toThrow(
      /parser id is required/,
    );
  });

  it("rejects an empty version", async () => {
    const { save } = buildDeps();
    await expect(save(valid({ version: "" }))).rejects.toThrow(
      /parser version is required/,
    );
  });

  it("rejects an invalid forType", async () => {
    const { save } = buildDeps();
    await expect(
      save(valid({ forType: { id: "", version: "v1" } })),
    ).rejects.toThrow(/parser.forType requires/);
  });

  it("rejects an unknown mode", async () => {
    const { save } = buildDeps();
    await expect(
      save(valid({ mode: "bogus" as never })),
    ).rejects.toThrow(/parser mode must be/);
  });

  it("rejects an undefined body", async () => {
    const { save } = buildDeps();
    await expect(
      save(valid({ body: undefined as never })),
    ).rejects.toThrow(/parser body is required/);
  });
});
