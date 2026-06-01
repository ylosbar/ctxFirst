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

describe("resolveNodeSpec — file.load", () => {
  // Base spec as `listNodeSpecs()` returns it for `file.load`: the static
  // `path` input plus empty outputs (the runner resolves outputs to [] when
  // config.outputKind is unset). The mirror must re-derive the `out` port.
  const fileLoadBase: NodeSpecView = {
    kind: "file.load",
    title: "Load File",
    inputs: [
      { name: "path", kinds: ["Path", "String", "Markdown", "*"], optional: true, primary: true },
    ],
    outputs: [],
  };

  it("emits the polymorphic `out` port from config.outputKind (Markdown)", () => {
    const spec = resolveNodeSpec(
      "file.load",
      { path: "", outputKind: "Markdown" },
      fileLoadBase,
    );
    expect(spec.outputs).toEqual([
      { name: "out", kind: "Markdown", primary: true },
    ]);
    // The static `path` input is preserved from base.
    expect(spec.inputs).toEqual(fileLoadBase.inputs);
  });

  it("emits a Json `out` port for outputKind=Json", () => {
    const spec = resolveNodeSpec(
      "file.load",
      { outputKind: "Json" },
      fileLoadBase,
    );
    expect(spec.outputs).toEqual([{ name: "out", kind: "Json", primary: true }]);
  });

  it("falls back to base (no output) for a missing or unsupported outputKind", () => {
    expect(resolveNodeSpec("file.load", {}, fileLoadBase).outputs).toEqual([]);
    expect(
      resolveNodeSpec("file.load", { outputKind: "Ticket" }, fileLoadBase)
        .outputs,
    ).toEqual([]);
  });
});

describe("resolveNodeSpec — workflow.call", () => {
  const base: NodeSpecView = {
    kind: "workflow.call",
    title: "Sub-workflow",
    inputs: [],
    outputs: [],
  };
  const subTemplates = new Map([
    [
      "invoke-claude-on-string@v1",
      [
        { name: "itemString", kind: "Markdown", role: "input" as const },
        { name: "answer", kind: "Markdown", role: "output" as const },
        { name: "scratch", kind: "Markdown", role: "internal" as const },
      ],
    ],
  ]);

  it("derives input/output ports from the referenced sub-template's interface", () => {
    const spec = resolveNodeSpec(
      "workflow.call",
      { templateId: "invoke-claude-on-string", templateVersion: "v1" },
      base,
      { subTemplates },
    );
    expect(spec.inputs).toEqual([{ name: "itemString", kinds: ["Markdown"] }]);
    expect(spec.outputs).toEqual([{ name: "answer", kind: "Markdown" }]);
  });

  it("falls back to the portless base when the child is unknown or config is missing", () => {
    expect(
      resolveNodeSpec("workflow.call", {}, base, { subTemplates }).inputs,
    ).toEqual([]);
    expect(
      resolveNodeSpec(
        "workflow.call",
        { templateId: "missing", templateVersion: "v9" },
        base,
        { subTemplates },
      ).outputs,
    ).toEqual([]);
  });
});
