import { describe, expect, it } from "vitest";
import { resolveNodeSpec } from "./resolve-node-spec";
import type { NodeSpecView } from "./types";

const base: NodeSpecView = {
  kind: "json.transform",
  title: "JSON Transform",
  inputs: [{ name: "json", kinds: ["*"], primary: true }],
  outputs: [{ name: "out", kind: "Json" }],
};

describe("resolveNodeSpec — json.transform", () => {
  it("types a plain (no-wrap) port as Json", () => {
    const spec = resolveNodeSpec(
      "json.transform",
      { transformations: [{ port: "out", expression: "$[*]" }] },
      base,
    );
    expect(spec.outputs).toEqual([
      { name: "out", kind: "Json", description: "JSONPath: $[*]" },
    ]);
  });

  it("types a wrap:list itemKind=Markdown port as MarkdownList (mirrors the runner)", () => {
    const spec = resolveNodeSpec(
      "json.transform",
      {
        transformations: [
          {
            port: "files",
            expression: "$.byFile[*]",
            wrap: "list",
            itemKind: "Markdown",
          },
        ],
      },
      base,
    );
    expect(spec.outputs[0]).toMatchObject({
      name: "files",
      kind: "MarkdownList",
    });
  });

  it("types a wrap:list default (Json) port as List<Json>", () => {
    const spec = resolveNodeSpec(
      "json.transform",
      {
        transformations: [{ port: "items", expression: "$[*]", wrap: "list" }],
      },
      base,
    );
    expect(spec.outputs[0]).toMatchObject({
      name: "items",
      kind: "List<Json>",
    });
  });
});
