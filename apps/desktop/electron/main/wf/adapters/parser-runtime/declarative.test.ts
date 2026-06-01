import { describe, expect, it } from "vitest";
import { createDeclarativeParserRuntime, ParserExecutionError } from "./declarative";
import type { ParserRecord } from "../../domain/parser";

const recordWith = (body: unknown): ParserRecord => ({
  id: "p",
  version: "v1",
  forType: { id: "t", version: "v1" },
  mode: "declarative",
  body,
  source: { kind: "user" },
  meta: {},
});

describe("declarative parser runtime", () => {
  const runtime = createDeclarativeParserRuntime();

  it("returns the raw value when operations is empty", async () => {
    const out = await runtime.run(recordWith({ operations: [] }), { a: 1 });
    expect(out).toEqual({ a: 1 });
  });

  it("picks a sub-tree by dotted path", async () => {
    const out = await runtime.run(
      recordWith({ operations: [{ op: "pick", path: "$.data.orders" }] }),
      { data: { orders: [1, 2, 3] } },
    );
    expect(out).toEqual([1, 2, 3]);
  });

  it("maps each array item through the given fields", async () => {
    const out = await runtime.run(
      recordWith({
        operations: [
          { op: "pick", path: "$.orders" },
          {
            op: "map",
            fields: { id: "$.id", total: "$.total_price" },
          },
        ],
      }),
      { orders: [{ id: 1, total_price: 9.9, junk: "x" }, { id: 2, total_price: 4.2 }] },
    );
    expect(out).toEqual([{ id: 1, total: 9.9 }, { id: 2, total: 4.2 }]);
  });

  it("handles nested map via inline op in fields, using `from`", async () => {
    const out = await runtime.run(
      recordWith({
        operations: [
          { op: "pick", path: "$.orders" },
          {
            op: "map",
            fields: {
              id: "$.id",
              items: {
                op: "map",
                from: "$.line_items",
                fields: { sku: "$.sku", qty: "$.quantity" },
              },
            },
          },
        ],
      }),
      {
        orders: [
          {
            id: 1,
            line_items: [
              { sku: "A", quantity: 2 },
              { sku: "B", quantity: 1 },
            ],
          },
        ],
      },
    );
    expect(out).toEqual([
      { id: 1, items: [{ sku: "A", qty: 2 }, { sku: "B", qty: 1 }] },
    ]);
  });

  it("filters by truthy path", async () => {
    const out = await runtime.run(
      recordWith({
        operations: [
          { op: "filter", path: "$.active" },
        ],
      }),
      [{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: 1 }],
    );
    expect(out).toEqual([{ id: 1, active: true }, { id: 3, active: 1 }]);
  });

  it("filters by strict equality", async () => {
    const out = await runtime.run(
      recordWith({
        operations: [{ op: "filter", path: "$.status", equals: "open" }],
      }),
      [{ status: "open" }, { status: "closed" }, { status: "open" }],
    );
    expect(out).toEqual([{ status: "open" }, { status: "open" }]);
  });

  it("filters by existence", async () => {
    const out = await runtime.run(
      recordWith({
        operations: [{ op: "filter", path: "$.email", exists: true }],
      }),
      [{ email: "a@b" }, { email: null }, {}],
    );
    expect(out).toEqual([{ email: "a@b" }]);
  });

  it("limits an array to N items", async () => {
    const out = await runtime.run(
      recordWith({ operations: [{ op: "limit", n: 2 }] }),
      [1, 2, 3, 4],
    );
    expect(out).toEqual([1, 2]);
  });

  it("supports numeric array indices in paths", async () => {
    const out = await runtime.run(
      recordWith({ operations: [{ op: "pick", path: "$.xs[1].name" }] }),
      { xs: [{ name: "a" }, { name: "b" }] },
    );
    expect(out).toBe("b");
  });

  it("returns undefined when descending through null/undefined", async () => {
    const out = await runtime.run(
      recordWith({ operations: [{ op: "pick", path: "$.a.b.c" }] }),
      { a: null },
    );
    expect(out).toBeUndefined();
  });

  it("throws ParserExecutionError with opIndex on bad input", async () => {
    await expect(
      runtime.run(
        recordWith({
          operations: [
            { op: "pick", path: "$.orders" },
            { op: "map", fields: { id: "$.id" } },
          ],
        }),
        { orders: { not: "an array" } },
      ),
    ).rejects.toMatchObject({
      name: "ParserExecutionError",
      opIndex: 1,
    });
  });

  it("rejects invalid path syntax", async () => {
    await expect(
      runtime.run(
        recordWith({ operations: [{ op: "pick", path: "data.orders" }] }),
        {},
      ),
    ).rejects.toBeInstanceOf(ParserExecutionError);
  });

  it("rejects a body that isn't a declarative tree", async () => {
    await expect(runtime.run(recordWith(null), {})).rejects.toThrow(
      /declarative body must be an object/,
    );
    await expect(runtime.run(recordWith({}), {})).rejects.toThrow(
      /"operations" array/,
    );
  });

  it("refuses to run a parser whose mode isn't declarative", async () => {
    const codeParser: ParserRecord = {
      ...recordWith({ operations: [] }),
      mode: "code",
      body: "(x) => x",
    };
    await expect(runtime.run(codeParser, {})).rejects.toThrow(
      /cannot execute parser .* of mode "code"/,
    );
  });
});
