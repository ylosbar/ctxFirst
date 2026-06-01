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
import type { ArtifactPayload } from "../domain/artifact-schemas";
import type {
  RunContext,
  RunContextInput,
  StepOutcome,
} from "../application/step-runner";
import { createLoopForeachRunner } from "./loop-foreach";

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
  stepId: asStepId("step-foreach"),
  step: {
    id: asStepId("step-foreach"),
    name: "foreach",
    kind: "loop.foreach",
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

const runner = createLoopForeachRunner();

describe("loop.foreach runner — resolveSpec", () => {
  it("defaults to Markdown items and declares matching MarkdownList input", () => {
    const spec = runner.resolveSpec({ config: {} });
    expect(spec.inputs).toEqual([
      {
        name: "items",
        kinds: ["MarkdownList"],
        primary: true,
        optional: true,
      },
    ]);
    expect(spec.outputs.map((o) => ({ name: o.name, kind: o.kind }))).toEqual([
      { name: "item", kind: "Markdown" },
    ]);
  });

  it("declares a PathList input and Path output when configured for paths", () => {
    const spec = runner.resolveSpec({ config: { itemKind: "Path" } });
    expect(spec.inputs[0].kinds).toEqual(["PathList"]);
    expect(spec.outputs[0].kind).toBe("Path");
  });

  it("rejects unknown itemKind", () => {
    expect(() =>
      runner.resolveSpec({ config: { itemKind: "Bogus" } }),
    ).toThrowError(/invalid `itemKind`/);
  });
});

describe("loop.foreach runner — run with static config.items", () => {
  it("emits a MarkdownList containing each item as a body", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { items: ["alpha", "beta", "gamma"] },
      inputs: [],
      store,
    });

    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced" }
    >;
    expect(outcome.kind).toBe("produced");
    expect(outcome.artifact.kind).toBe("MarkdownList");

    const persisted = store.all();
    expect(persisted).toHaveLength(1);
    expect(JSON.parse(persisted[0].content)).toEqual({
      format: "markdown-list",
      bodies: ["alpha", "beta", "gamma"],
    });
    expect(persisted[0].metadata).toMatchObject({
      source: "loop.foreach",
      itemKind: "Markdown",
      count: "3",
    });
  });

  it("emits a PathList when itemKind=Path", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { itemKind: "Path", items: ["/tmp/a", "/tmp/b"] },
      inputs: [],
      store,
    });

    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced" }
    >;
    expect(outcome.artifact.kind).toBe("PathList");

    const persisted = store.all();
    expect(JSON.parse(persisted[0].content)).toEqual({
      format: "path-list",
      paths: ["/tmp/a", "/tmp/b"],
    });
  });
});

describe("loop.foreach runner — run with wired input", () => {
  it("accepts a MarkdownList input on port `items` and re-emits its bodies", async () => {
    const store = createStubArtifactStore();
    const payload: ArtifactPayload<"MarkdownList"> = {
      format: "markdown-list",
      bodies: ["one", "two"],
    };
    const ctx = buildCtx({
      config: {},
      inputs: [
        {
          port: "items",
          kind: "MarkdownList",
          content: JSON.stringify(payload),
          payload,
          artifactId: asArtifactId("upstream-1"),
        },
      ],
      store,
    });

    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced" }
    >;
    expect(outcome.artifact.kind).toBe("MarkdownList");
    expect(JSON.parse(store.all()[0].content)).toEqual({
      format: "markdown-list",
      bodies: ["one", "two"],
    });
  });

  it("rejects an input of the wrong kind", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {},
      inputs: [
        {
          port: "items",
          kind: "Markdown",
          content: "not a list",
          payload: { format: "markdown", body: "not a list" },
          artifactId: asArtifactId("upstream-1"),
        },
      ],
      store,
    });
    await expect(runner.run(ctx)).rejects.toThrowError(
      /expected input kind MarkdownList/,
    );
  });

  it("throws when neither static items nor input wired", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({ config: {}, inputs: [], store });
    await expect(runner.run(ctx)).rejects.toThrowError(
      /no `items` input wired/,
    );
  });
});

describe("loop.foreach runner — generic List<T> (itemKind=Json)", () => {
  it("declares a List<Json> input and Json output", () => {
    const spec = runner.resolveSpec({ config: { itemKind: "Json" } });
    expect(spec.inputs[0].kinds).toEqual(["List<Json>"]);
    expect(spec.outputs[0].kind).toBe("Json");
  });

  it("re-emits the element payloads of a wired List<Json> verbatim", async () => {
    const store = createStubArtifactStore();
    const items = [
      { format: "json", body: '{"file":"a.tsx"}' },
      { format: "json", body: '{"file":"b.tsx"}' },
    ];
    const payload = { items };
    const ctx = buildCtx({
      config: { itemKind: "Json" },
      inputs: [
        {
          port: "items",
          kind: "List<Json>",
          content: JSON.stringify(payload),
          payload,
          artifactId: asArtifactId("upstream-1"),
        },
      ],
      store,
    });

    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced" }
    >;
    expect(outcome.artifact.kind).toBe("List<Json>");
    expect(JSON.parse(store.all()[0].content)).toEqual({ items });
    expect(store.all()[0].metadata).toMatchObject({
      source: "loop.foreach",
      itemKind: "Json",
      count: "2",
    });
  });

  it("accepts a legacy MarkdownList spelling against a List<Markdown> port", () => {
    // canonicalisation folds MarkdownList ⟷ List<Markdown>.
    const spec = runner.resolveSpec({ config: { itemKind: "Markdown" } });
    expect(spec.inputs[0].kinds).toEqual(["MarkdownList"]);
  });
});
