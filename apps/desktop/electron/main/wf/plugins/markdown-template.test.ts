import { describe, expect, it } from "vitest";
import {
  asArtifactHash,
  asArtifactId,
  asStepExecId,
  asStepId,
  asWorkflowId,
} from "../domain/ids";
import type { Artifact, ArtifactKind } from "../domain/artifact";
import type { ArtifactStore } from "../application/ports/outbound/artifact-store";
import type { RunContext, RunContextInput } from "../application/step-runner";
import { createMarkdownTemplateRunner } from "./markdown-template";

type StoredArtifact = {
  kind: ArtifactKind;
  content: string;
  metadata: Record<string, string>;
};

type StubStore = ArtifactStore & {
  all: () => ReadonlyArray<StoredArtifact>;
};

const createStubArtifactStore = (): StubStore => {
  const stored: StoredArtifact[] = [];
  let counter = 0;
  return {
    async put(kind, content, metadata = {}): Promise<Artifact> {
      counter += 1;
      stored.push({ kind, content, metadata });
      return {
        id: asArtifactId(`artifact-${counter}`),
        kind,
        hash: asArtifactHash(`hash-${counter}`),
        storageRef: "stub",
        metadata,
        createdAt: "2026-06-18T00:00:00.000Z",
      };
    },
    async get() {
      throw new Error("not implemented");
    },
    async getByHash() {
      return null;
    },
    all: () => stored,
  };
};

const md = (port: string, body: string): RunContextInput => ({
  port,
  kind: "Markdown",
  content: JSON.stringify({ format: "markdown", body }),
  payload: { format: "markdown", body },
  artifactId: asArtifactId(`artifact-${port}`),
});

const json = (port: string, body: string): RunContextInput => ({
  port,
  kind: "Json",
  content: JSON.stringify({ format: "json", body }),
  payload: { format: "json", body },
  artifactId: asArtifactId(`artifact-${port}`),
});

const buildCtx = (params: {
  config: Readonly<Record<string, unknown>>;
  inputs: ReadonlyArray<RunContextInput>;
  store: ArtifactStore;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-template"),
  step: {
    id: asStepId("step-template"),
    name: "template",
    kind: "markdown.template",
    actorRole: "Developer",
    config: params.config,
    humanGateRequired: false,
  },
  inputs: params.inputs,
  loopHistory: [],
  attempt: 0,
  workspace: {},
  deps: {
    artifactStore: params.store,
    llm: undefined as never,
    linear: undefined as never,
    shell: undefined as never,
    runLog: undefined as never,
    clock: undefined as never,
    ids: undefined as never,
    llmSession: undefined as never,
    logger: undefined as never,
    hash: undefined as never,
    path: undefined as never,
    environment: undefined as never,
    fs: undefined as never,
  },
});

const bodyOfStored = (stored: StoredArtifact): string =>
  (JSON.parse(stored.content) as { body: string }).body;

const runner = createMarkdownTemplateRunner();

describe("markdown.template — resolveSpec (dynamic ports)", () => {
  it("derives one optional Markdown|Json input port per placeholder, in order, deduped, preceded by `in`", () => {
    const spec = runner.resolveSpec({
      config: { template: "Analyse {{spec}} selon {{style}} et {{spec}} encore." },
    });
    expect(spec.inputs).toEqual([
      { name: "in", kinds: ["*"], optional: true },
      { name: "spec", kinds: ["Markdown", "Json"], optional: true },
      { name: "style", kinds: ["Markdown", "Json"], optional: true },
    ]);
    expect(spec.outputs).toEqual([
      { name: "out", kind: "Markdown", primary: true },
    ]);
  });

  it("falls back to the permissive `in`-only signature on an empty/absent template (catalogue)", () => {
    expect(runner.resolveSpec({ config: {} }).inputs).toEqual([
      { name: "in", kinds: ["*"], optional: true },
    ]);
    expect(runner.resolveSpec({ config: { template: "" } }).inputs).toEqual([
      { name: "in", kinds: ["*"], optional: true },
    ]);
  });

  it("keeps the `in` chaining port for a template with no placeholder", () => {
    const spec = runner.resolveSpec({ config: { template: "no vars here" } });
    expect(spec.inputs).toEqual([{ name: "in", kinds: ["*"], optional: true }]);
  });

  it("lets a literal {{in}} placeholder shadow the chaining port", () => {
    const spec = runner.resolveSpec({ config: { template: "{{in}} {{x}}" } });
    expect(spec.inputs).toEqual([
      { name: "in", kinds: ["Markdown", "Json"], optional: true },
      { name: "x", kinds: ["Markdown", "Json"], optional: true },
    ]);
  });
});

describe("markdown.template — run (hydration)", () => {
  it("substitutes a single placeholder from its port (key = port = placeholder)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { template: "Analyse {{spec}}." },
      inputs: [md("spec", "the spec body")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("Analyse the spec body.");
    expect(store.all()[0].kind).toBe("Markdown");
    expect(store.all()[0].metadata).toMatchObject({
      source: "markdown.template",
    });
  });

  it("substitutes multiple placeholders, including a Json fragment", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { template: "{{spec}} :: {{style}}" },
      inputs: [md("spec", "S"), json("style", '{"tone":"dry"}')],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe('S :: {"tone":"dry"}');
  });

  it("ignores a port whose name is not a placeholder of the template", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { template: "Hello {{spec}}" },
      inputs: [md("spec", "S"), md("dangling", "EXTRA")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("Hello S");
  });

  it("drops an unwired placeholder by default (onMissing=empty)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { template: "[{{spec}}][{{absent}}]" },
      inputs: [md("spec", "S")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("[S][]");
    expect(store.all()[0].metadata.missing).toBe("absent");
  });

  it("keeps an unwired placeholder literal under onMissing=keep", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { template: "{{spec}} {{absent}}", onMissing: "keep" },
      inputs: [md("spec", "S")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("S {{absent}}");
  });

  it("fails the run under onMissing=error when a placeholder is unwired", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { template: "{{spec}} {{absent}}", onMissing: "error" },
      inputs: [md("spec", "S")],
      store,
    });
    await expect(runner.run(ctx)).rejects.toThrow(/\{\{absent\}\}/);
  });

  it("does not substitute the chaining `in` port (a literal {{in}} is dropped)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { template: "X {{in}} Y" },
      inputs: [md("in", "CHAIN")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("X  Y");
  });

  it("emits a template with no placeholder verbatim", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { template: "Just a plain prompt." },
      inputs: [],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("Just a plain prompt.");
  });
});
