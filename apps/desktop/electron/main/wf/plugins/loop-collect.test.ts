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
import type {
  RunContext,
  RunContextInput,
  StepOutcome,
} from "../application/step-runner";
import { createLoopCollectRunner } from "./loop-collect";

type StoredArtifact = {
  kind: ArtifactKind;
  content: string;
  metadata: Record<string, string>;
};

const createStubArtifactStore = (): ArtifactStore & {
  all: () => ReadonlyArray<StoredArtifact>;
} => {
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
        createdAt: "2026-05-14T00:00:00.000Z",
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

const buildCtx = (params: {
  config: Readonly<Record<string, unknown>>;
  inputs: ReadonlyArray<RunContextInput>;
  store: ArtifactStore;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-collect"),
  step: {
    id: asStepId("step-collect"),
    name: "collect",
    kind: "loop.collect",
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

const runner = createLoopCollectRunner();

describe("loop.collect runner — resolveSpec", () => {
  it("declares an isList Markdown input and a MarkdownList output by default", () => {
    const spec = runner.resolveSpec({ config: {} });
    expect(spec.inputs).toEqual([
      {
        name: "item",
        kinds: ["Markdown"],
        isList: true,
        primary: true,
      },
    ]);
    expect(spec.outputs[0]).toMatchObject({
      name: "items",
      kind: "MarkdownList",
    });
  });

  it("swaps to Path/PathList when itemKind=Path", () => {
    const spec = runner.resolveSpec({ config: { itemKind: "Path" } });
    expect(spec.inputs[0].kinds).toEqual(["Path"]);
    expect(spec.outputs[0].kind).toBe("PathList");
  });
});

describe("loop.collect runner — run", () => {
  it("stacks N Markdown bodies into a MarkdownList in input order", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {},
      inputs: [
        {
          port: "item",
          kind: "Markdown",
          content: JSON.stringify({ format: "markdown", body: "first" }),
          payload: { format: "markdown", body: "first" },
          artifactId: asArtifactId("a-0"),
        },
        {
          port: "item",
          kind: "Markdown",
          content: JSON.stringify({ format: "markdown", body: "second" }),
          payload: { format: "markdown", body: "second" },
          artifactId: asArtifactId("a-1"),
        },
        {
          port: "item",
          kind: "Markdown",
          content: JSON.stringify({ format: "markdown", body: "third" }),
          payload: { format: "markdown", body: "third" },
          artifactId: asArtifactId("a-2"),
        },
      ],
      store,
    });

    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced" }
    >;
    expect(outcome.artifact.kind).toBe("MarkdownList");
    const persisted = store.all();
    expect(JSON.parse(persisted[0].content)).toEqual({
      format: "markdown-list",
      bodies: ["first", "second", "third"],
    });
  });

  it("produces an empty MarkdownList when no inputs", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({ config: {}, inputs: [], store });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced" }
    >;
    expect(JSON.parse(store.all()[0].content)).toEqual({
      format: "markdown-list",
      bodies: [],
    });
    expect(outcome.artifact.kind).toBe("MarkdownList");
  });

  it("stacks Json items into a List<Json> when itemKind=Json", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { itemKind: "Json" },
      inputs: [
        {
          port: "item",
          kind: "Json",
          content: JSON.stringify({ format: "json", body: "1" }),
          payload: { format: "json", body: "1" },
          artifactId: asArtifactId("a-0"),
        },
        {
          port: "item",
          kind: "Json",
          content: JSON.stringify({ format: "json", body: "2" }),
          payload: { format: "json", body: "2" },
          artifactId: asArtifactId("a-1"),
        },
      ],
      store,
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced" }
    >;
    expect(outcome.artifact.kind).toBe("List<Json>");
    expect(JSON.parse(store.all()[0].content)).toEqual({
      items: [
        { format: "json", body: "1" },
        { format: "json", body: "2" },
      ],
    });
  });

  it("declares a List<Json> output when itemKind=Json", () => {
    const spec = runner.resolveSpec({ config: { itemKind: "Json" } });
    expect(spec.inputs[0].kinds).toEqual(["Json"]);
    expect(spec.outputs[0].kind).toBe("List<Json>");
  });

  it("stacks Path inputs into a PathList when itemKind=Path", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { itemKind: "Path" },
      inputs: [
        {
          port: "item",
          kind: "Path",
          content: JSON.stringify({ path: "/tmp/a" }),
          payload: { path: "/tmp/a" },
          artifactId: asArtifactId("a-0"),
        },
        {
          port: "item",
          kind: "Path",
          content: JSON.stringify({ path: "/tmp/b" }),
          payload: { path: "/tmp/b" },
          artifactId: asArtifactId("a-1"),
        },
      ],
      store,
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced" }
    >;
    expect(outcome.artifact.kind).toBe("PathList");
    expect(JSON.parse(store.all()[0].content)).toEqual({
      format: "path-list",
      paths: ["/tmp/a", "/tmp/b"],
    });
  });
});
