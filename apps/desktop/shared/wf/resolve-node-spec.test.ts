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

describe("resolveNodeSpec — files.load", () => {
  // Base spec as `listNodeSpecs()` returns it for `files.load`: the static
  // `path` input plus empty outputs (the runner resolves outputs to [] until a
  // valid slot exists). The mirror must re-derive one port per slot.
  const filesLoadBase: NodeSpecView = {
    kind: "files.load",
    title: "Load Files",
    inputs: [
      {
        name: "path",
        kinds: ["Path", "String", "Markdown", "*"],
        optional: true,
        primary: true,
      },
    ],
    outputs: [],
  };

  it("emits one output port per slot, in order, first marked primary", () => {
    const spec = resolveNodeSpec(
      "files.load",
      {
        path: "/base",
        slots: [
          { port: "spec", subpath: "spec.md", outputKind: "Markdown" },
          { port: "data", subpath: "data.json", outputKind: "Json" },
        ],
      },
      filesLoadBase,
    );
    expect(spec.outputs).toEqual([
      {
        name: "spec",
        kind: "Markdown",
        primary: true,
        description: "spec.md → Markdown",
      },
      {
        name: "data",
        kind: "Json",
        primary: false,
        description: "data.json → Json",
      },
    ]);
    // The static `path` input is preserved from base.
    expect(spec.inputs).toEqual(filesLoadBase.inputs);
  });

  it("skips invalid slots and falls back to base when none remain", () => {
    expect(resolveNodeSpec("files.load", {}, filesLoadBase).outputs).toEqual([]);
    expect(
      resolveNodeSpec(
        "files.load",
        { slots: [{ port: "out", subpath: "x", outputKind: "Path" }] },
        filesLoadBase,
      ).outputs,
    ).toEqual([]);
  });
});

describe("resolveNodeSpec — gitlab.files.fetch", () => {
  // Base spec as `listNodeSpecs()` returns it for `gitlab.files.fetch`: the
  // optional `in` envelope input plus empty outputs (the runner resolves
  // outputs to [] until a valid slot exists). The mirror re-derives one port
  // per slot, exactly like `files.load`.
  const gitlabFilesFetchBase: NodeSpecView = {
    kind: "gitlab.files.fetch",
    title: "GitLab: fetch files",
    inputs: [{ name: "in", kinds: ["Json", "*"], optional: true }],
    outputs: [],
  };

  it("emits one output port per slot, in order, first marked primary", () => {
    const spec = resolveNodeSpec(
      "gitlab.files.fetch",
      {
        project: "group/project",
        ref: "main",
        basePath: "docs",
        slots: [
          { port: "spec", subpath: "spec.md", outputKind: "Markdown" },
          { port: "data", subpath: "api.json", outputKind: "Json" },
        ],
      },
      gitlabFilesFetchBase,
    );
    expect(spec.outputs).toEqual([
      {
        name: "spec",
        kind: "Markdown",
        primary: true,
        description: "spec.md → Markdown",
      },
      {
        name: "data",
        kind: "Json",
        primary: false,
        description: "api.json → Json",
      },
    ]);
    // The optional `in` input is preserved from base.
    expect(spec.inputs).toEqual(gitlabFilesFetchBase.inputs);
  });

  it("skips invalid slots and falls back to base when none remain", () => {
    expect(
      resolveNodeSpec("gitlab.files.fetch", {}, gitlabFilesFetchBase).outputs,
    ).toEqual([]);
    expect(
      resolveNodeSpec(
        "gitlab.files.fetch",
        { slots: [{ port: "out", subpath: "x", outputKind: "Path" }] },
        gitlabFilesFetchBase,
      ).outputs,
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

describe("resolveNodeSpec — branch.json", () => {
  const base: NodeSpecView = {
    kind: "branch.json",
    title: "Branch (JSON)",
    inputs: [{ name: "json", kinds: ["*"], primary: true }],
    outputs: [],
  };

  it("emits one passthrough port per case (default Json) with a wildcard input", () => {
    const spec = resolveNodeSpec(
      "branch.json",
      { path: "$.flag", cases: ["true", "false"] },
      base,
    );
    expect(spec.inputs).toEqual([{ name: "json", kinds: ["*"], primary: true }]);
    expect(spec.outputs).toEqual([
      { name: "true", kind: "Json", description: 'Branch when $.flag equals "true".' },
      { name: "false", kind: "Json", description: 'Branch when $.flag equals "false".' },
    ]);
  });

  it("honors a custom inputKind for the passthrough ports", () => {
    const spec = resolveNodeSpec(
      "branch.json",
      { path: "$.flag", cases: ["a", "b"], inputKind: "Markdown" },
      base,
    );
    expect(spec.outputs.map((o) => o.kind)).toEqual(["Markdown", "Markdown"]);
  });

  it("falls back to the permissive base when cases is malformed", () => {
    expect(resolveNodeSpec("branch.json", { path: "$.flag" }, base).outputs).toEqual(
      [],
    );
    expect(
      resolveNodeSpec("branch.json", { path: "$.flag", cases: ["only"] }, base)
        .outputs,
    ).toEqual([]);
  });
});
