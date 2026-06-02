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
import { createConcatMarkdownRunner } from "./concat-markdown";

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
        createdAt: "2026-05-24T00:00:00.000Z",
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
  readsFrom?: Readonly<Record<string, string>>;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-concat"),
  step: {
    id: asStepId("step-concat"),
    name: "concat",
    kind: "concat.markdown",
    actorRole: "Developer",
    config: params.config,
    humanGateRequired: false,
    readsFrom: params.readsFrom,
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

const runner = createConcatMarkdownRunner();

describe("concat.markdown — mode concat (legacy)", () => {
  it("concatenates main + markdown1..3 in declaration order with separator", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {},
      inputs: [
        md("main", "M"),
        md("markdown1", "A"),
        md("markdown2", "B"),
        md("markdown3", "C"),
      ],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("M\n\nA\n\nB\n\nC");
  });

  it("concatenates a Json fragment into the Markdown output (e.g. example in a prompt)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {},
      inputs: [md("main", "Prompt:"), json("markdown1", '{"k":"v"}')],
      store,
    });
    await runner.run(ctx);
    expect(store.all()[0].kind).toBe("Markdown");
    expect(bodyOfStored(store.all()[0])).toBe('Prompt:\n\n{"k":"v"}');
  });

  it("reverses the order under order=bottom-to-top", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { order: "bottom-to-top" },
      inputs: [md("main", "M"), md("markdown1", "A")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("A\n\nM");
  });

  it("wraps the body with header / footer using the separator", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { header: "H", footer: "F", separator: " | " },
      inputs: [md("main", "M"), md("markdown1", "A")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("H | M | A | F");
  });

  it("wraps a single port with entries.header / entries.footer", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { entries: { main: { header: "H", footer: "F" } } },
      inputs: [md("main", "M"), md("markdown1", "A")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("H\n\nM\n\nF\n\nA");
  });

  it("wraps multiple ports with a custom separator", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        separator: " | ",
        entries: {
          main: { header: "##M" },
          markdown1: { footer: "---" },
        },
      },
      inputs: [md("main", "x"), md("markdown1", "y")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("##M | x | y | ---");
  });

  it("emits no extra separator when only the entry header is set", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { entries: { main: { header: "##M" } } },
      inputs: [md("main", "x")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("##M\n\nx");
  });

  it("does not emit entry wrappers for a port that is not wired", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { entries: { markdown2: { header: "Z" } } },
      inputs: [md("main", "x")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("x");
  });

  it("keeps entry wrappers attached to their part when reversing the order", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        order: "bottom-to-top",
        entries: {
          main: { header: "MH" },
          markdown1: { footer: "1F" },
        },
      },
      inputs: [md("main", "M"), md("markdown1", "A")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("A\n\n1F\n\nMH\n\nM");
  });

  it("combines entry wrappers with global header / footer", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        header: "GH",
        footer: "GF",
        entries: { main: { header: "MH" } },
      },
      inputs: [md("main", "x"), md("markdown1", "y")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("GH\n\nMH\n\nx\n\ny\n\nGF");
  });

  it("ignores a non-object `entries` value defensively", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { entries: "broken" },
      inputs: [md("main", "x")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("x");
  });

  it("ignores a non-string wrapper field defensively", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { entries: { main: { header: 42 } } },
      inputs: [md("main", "x")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("x");
  });
});

describe("concat.markdown — mode template", () => {
  it("substitutes {{spec}} via readsFrom on markdown1", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { mode: "template" },
      inputs: [md("main", "A {{spec}} B"), md("markdown1", "S")],
      store,
      readsFrom: { markdown1: "spec" },
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("A S B");
  });

  it("falls back to the port name when no readsFrom is set", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { mode: "template" },
      inputs: [md("main", "{{markdown1}}"), md("markdown1", "S")],
      store,
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("S");
  });

  it("keeps unresolved placeholders literal under onMissing=keep (default)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { mode: "template" },
      inputs: [md("main", "{{spec}} {{patch}}"), md("markdown1", "S")],
      store,
      readsFrom: { markdown1: "spec" },
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("S {{patch}}");
  });

  it("empties unresolved placeholders under onMissing=empty", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { mode: "template", onMissing: "empty" },
      inputs: [md("main", "[{{a}}][{{b}}]"), md("markdown1", "A")],
      store,
      readsFrom: { markdown1: "a" },
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("[A][]");
  });

  it("fails the step under onMissing=error", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { mode: "template", onMissing: "error" },
      inputs: [md("main", "{{a}} {{b}}"), md("markdown1", "A")],
      store,
      readsFrom: { markdown1: "a" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/\{\{b\}\}/);
  });

  it("appends unused ports at the end with the separator (default onUnused=append)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { mode: "template" },
      inputs: [
        md("main", "Hello {{spec}}"),
        md("markdown1", "S"),
        md("markdown2", "EXTRA"),
      ],
      store,
      readsFrom: { markdown1: "spec", markdown2: "dangling" },
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("Hello S\n\nEXTRA");
  });

  it("omits unused ports under onUnused=ignore", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { mode: "template", onUnused: "ignore" },
      inputs: [
        md("main", "Hello {{spec}}"),
        md("markdown1", "S"),
        md("markdown2", "EXTRA"),
      ],
      store,
      readsFrom: { markdown1: "spec", markdown2: "dangling" },
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("Hello S");
  });

  it("wraps the rendered body with header / footer", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { mode: "template", header: "H", footer: "F" },
      inputs: [md("main", "A {{x}} B"), md("markdown1", "X")],
      store,
      readsFrom: { markdown1: "x" },
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("H\n\nA X B\n\nF");
  });

  it("throws when port `main` is not wired", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { mode: "template" },
      inputs: [md("markdown1", "S")],
      store,
      readsFrom: { markdown1: "spec" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/`main` non câblé/);
  });

  it("ignores per-entry wrappers in template mode", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        mode: "template",
        entries: { main: { header: "MH" } },
      },
      inputs: [md("main", "{{x}}"), md("markdown1", "X")],
      store,
      readsFrom: { markdown1: "x" },
    });
    await runner.run(ctx);
    expect(bodyOfStored(store.all()[0])).toBe("X");
  });

  it("records missing/unused in the artifact metadata for debug", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { mode: "template" },
      inputs: [md("main", "{{spec}} {{absent}}"), md("markdown1", "S"), md("markdown2", "X")],
      store,
      readsFrom: { markdown1: "spec", markdown2: "dangling" },
    });
    await runner.run(ctx);
    expect(store.all()[0].metadata).toMatchObject({
      source: "concat.markdown",
      mode: "template",
      missing: "absent",
      unused: "dangling",
    });
  });
});
