import { describe, expect, it } from "vitest";
import { makeListParsers } from "./list-parsers";
import { createFakeParserRegistry } from "../../__tests__/fixtures/fake-registries";

describe("listParsers use-case", () => {
  it("forwards to the registry, optionally filtering by target type", async () => {
    const parsers = createFakeParserRegistry();
    await parsers.save({
      id: "p1",
      version: "v1",
      forType: { id: "Foo", version: "v1" },
      mode: "declarative",
      body: {},
      meta: {},
    });
    await parsers.save({
      id: "p2",
      version: "v1",
      forType: { id: "Bar", version: "v1" },
      mode: "declarative",
      body: {},
      meta: {},
    });

    const list = makeListParsers({ parsers });
    expect(await list()).toHaveLength(2);
    expect(await list({ id: "Foo", version: "v1" })).toHaveLength(1);
  });
});
