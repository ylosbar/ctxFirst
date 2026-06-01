import { describe, expect, it } from "vitest";
import { makeDeleteParser } from "./delete-parser";
import { createFakeParserRegistry } from "../../__tests__/fixtures/fake-registries";

describe("deleteParser use-case", () => {
  it("removes an existing parser", async () => {
    const parsers = createFakeParserRegistry();
    await parsers.save({
      id: "p1",
      version: "v1",
      forType: { id: "Foo", version: "v1" },
      mode: "declarative",
      body: {},
      meta: {},
    });
    expect(parsers.resolve({ id: "p1", version: "v1" })).not.toBeNull();

    const remove = makeDeleteParser({ parsers });
    await remove({ id: "p1", version: "v1" });
    expect(parsers.resolve({ id: "p1", version: "v1" })).toBeNull();
  });

  it("is idempotent on an absent ref", async () => {
    const parsers = createFakeParserRegistry();
    const remove = makeDeleteParser({ parsers });
    await expect(remove({ id: "ghost", version: "v1" })).resolves.toBeUndefined();
  });

  it("rejects an invalid ref", async () => {
    const parsers = createFakeParserRegistry();
    const remove = makeDeleteParser({ parsers });
    await expect(remove({ id: "  ", version: "v1" })).rejects.toThrow(
      /parser ref requires id and version/,
    );
  });
});
