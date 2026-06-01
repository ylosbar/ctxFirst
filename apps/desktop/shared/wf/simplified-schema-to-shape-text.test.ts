import { describe, expect, it } from "vitest";

import { simplifiedSchemaToShapeText } from "./simplified-schema-to-shape-text";

describe("simplifiedSchemaToShapeText — built-in shapes", () => {
  it("projects a Path-shaped object", () => {
    expect(
      simplifiedSchemaToShapeText({
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      }),
    ).toBe("{ path: string }");
  });

  it("projects a PathList envelope with literal `format`", () => {
    expect(
      simplifiedSchemaToShapeText({
        type: "object",
        properties: {
          format: { const: "path-list" },
          paths: { type: "array", items: { type: "string" } },
        },
        required: ["format", "paths"],
      }),
    ).toBe(`{ format: "path-list", paths: string[] }`);
  });

  it("projects the Markdown envelope with an `enum` format", () => {
    expect(
      simplifiedSchemaToShapeText({
        type: "object",
        properties: {
          format: { enum: ["markdown"] },
          body: { type: "string" },
        },
        required: ["format", "body"],
      }),
    ).toBe(`{ format: "markdown", body: string }`);
  });

  it("annotates `Url` refinements with their format", () => {
    expect(
      simplifiedSchemaToShapeText({
        type: "object",
        properties: { value: { type: "string", format: "url" } },
        required: ["value"],
      }),
    ).toBe("{ value: string /* url */ }");
  });

  it("renders `number` for integer/number types", () => {
    expect(
      simplifiedSchemaToShapeText({
        type: "object",
        properties: { value: { type: "number" } },
        required: ["value"],
      }),
    ).toBe("{ value: number }");
  });
});

describe("simplifiedSchemaToShapeText — composites", () => {
  it("renders an array as `T[]`", () => {
    expect(
      simplifiedSchemaToShapeText({
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                format: { const: "markdown" },
                body: { type: "string" },
              },
              required: ["format", "body"],
            },
          },
        },
        required: ["items"],
      }),
    ).toBe(`{ items: { format: "markdown", body: string }[] }`);
  });

  it("renders `oneOf` as a pipe-separated union", () => {
    expect(
      simplifiedSchemaToShapeText({
        oneOf: [{ type: "string" }, { type: "number" }],
      }),
    ).toBe("string | number");
  });

  it("marks optional properties with `?`", () => {
    expect(
      simplifiedSchemaToShapeText({
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "number" },
        },
        required: ["a"],
      }),
    ).toBe("{ a: string, b?: number }");
  });
});

describe("simplifiedSchemaToShapeText — resilience", () => {
  it("truncates beyond `maxDepth`", () => {
    const deeplyNested = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: {
            b: {
              type: "object",
              properties: {
                c: { type: "string" },
              },
              required: ["c"],
            },
          },
          required: ["b"],
        },
      },
      required: ["a"],
    };
    expect(
      simplifiedSchemaToShapeText(deeplyNested, { maxDepth: 1 }),
    ).toBe("{ a: { b: … } }");
    expect(
      simplifiedSchemaToShapeText(deeplyNested, { maxDepth: 0 }),
    ).toBe("{ a: … }");
  });

  it("falls back to `unknown` for malformed input", () => {
    expect(simplifiedSchemaToShapeText({ type: "weird" })).toBe("unknown");
    expect(simplifiedSchemaToShapeText(null)).toBe("unknown");
    expect(simplifiedSchemaToShapeText(42)).toBe("unknown");
  });

  it("delegates `$kind` to the resolver and short-circuits when null", () => {
    expect(
      simplifiedSchemaToShapeText({ $kind: "Markdown" }, { resolve: () => null }),
    ).toBe("Markdown");
    expect(
      simplifiedSchemaToShapeText({ $kind: "Markdown" }, {
        resolve: (k) => (k === "Markdown" ? "{ format: \"markdown\", body: string }" : null),
      }),
    ).toBe("{ format: \"markdown\", body: string }");
  });
});
