import { describe, expect, it } from "vitest";
import { makeRunParser } from "./run-parser";
import { createFakeParserRegistry } from "../../__tests__/fixtures/fake-registries";
import { createFakeParserRuntime } from "../../__tests__/fixtures/fake-parser-runtime";

const buildDeps = () => {
  const fakes = {
    parsers: createFakeParserRegistry(),
    parserRuntime: createFakeParserRuntime(),
  };
  return { fakes, runParser: makeRunParser(fakes) };
};

describe("runParser use-case", () => {
  it("saved kind: looks up the parser and forwards it to the runtime", async () => {
    const { fakes, runParser } = buildDeps();
    fakes.parsers.push({
      id: "p1",
      version: "v1",
      forType: { id: "Foo", version: "v1" },
      mode: "declarative",
      body: { operations: [] },
      source: { kind: "user" },
      meta: {},
    });
    fakes.parserRuntime.setMapping(
      { id: "p1", version: "v1" },
      (raw) => ({ wrapped: raw }),
    );

    const result = await runParser({
      kind: "saved",
      ref: { id: "p1", version: "v1" },
      raw: { x: 1 },
    });
    expect(result).toEqual({ ok: true, simplified: { wrapped: { x: 1 } } });
    expect(fakes.parserRuntime.invocations).toHaveLength(1);
    expect(fakes.parserRuntime.invocations[0].parser.id).toBe("p1");
  });

  it("saved kind: throws when the parser cannot be resolved", async () => {
    const { runParser, fakes } = buildDeps();
    await expect(
      runParser({
        kind: "saved",
        ref: { id: "ghost", version: "v1" },
        raw: null,
      }),
    ).rejects.toThrow(/unknown parser ghost@v1/);
    expect(fakes.parserRuntime.invocations).toHaveLength(0);
  });

  it("inline kind: synthesizes a playground record and runs it", async () => {
    const { fakes, runParser } = buildDeps();
    fakes.parserRuntime.setMapping(
      { id: "__playground__", version: "v0" },
      () => ({ inline: true }),
    );

    const result = await runParser({
      kind: "inline",
      forType: { id: "Foo", version: "v1" },
      mode: "code",
      body: "export default (r) => r",
      raw: "raw payload",
    });

    expect(result).toEqual({ ok: true, simplified: { inline: true } });
    expect(fakes.parserRuntime.invocations).toHaveLength(1);
    const record = fakes.parserRuntime.invocations[0].parser;
    expect(record.id).toBe("__playground__");
    expect(record.version).toBe("v0");
    expect(record.mode).toBe("code");
    expect(record.source).toEqual({ kind: "user" });
  });

  it("propagates runtime errors verbatim", async () => {
    const { fakes, runParser } = buildDeps();
    fakes.parsers.push({
      id: "p1",
      version: "v1",
      forType: { id: "Foo", version: "v1" },
      mode: "code",
      body: "throw",
      source: { kind: "user" },
      meta: {},
    });
    fakes.parserRuntime.setError(
      { id: "p1", version: "v1" },
      new Error("op 2 failed"),
    );
    await expect(
      runParser({
        kind: "saved",
        ref: { id: "p1", version: "v1" },
        raw: null,
      }),
    ).rejects.toThrow(/op 2 failed/);
  });
});
