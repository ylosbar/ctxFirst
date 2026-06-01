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
import { createJsonTransformRunner } from "./json-transform";

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
  stepId: asStepId("step-json"),
  step: {
    id: asStepId("step-json"),
    name: "json",
    kind: "json.transform",
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

const jsonInput = (body: string): RunContextInput => ({
  port: "json",
  kind: "Json",
  content: JSON.stringify({ format: "json", body }),
  payload: { format: "json", body },
  artifactId: asArtifactId("upstream-1"),
});

const runner = createJsonTransformRunner();

describe("json.transform — wrap:list", () => {
  it("resolveSpec declares a List<Json> output for a wrap:list port", () => {
    const spec = runner.resolveSpec({
      config: { transformations: [{ port: "items", expression: "$[*]", wrap: "list" }] },
    });
    expect(spec.outputs[0]).toMatchObject({ name: "items", kind: "List<Json>" });
  });

  it("emits a canonical List<Json> with one Json element per match", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { transformations: [{ port: "items", expression: "$[*]", wrap: "list" }] },
      inputs: [jsonInput('[{"file":"a.tsx"},{"file":"b.tsx"}]')],
      store,
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced-many" }
    >;
    expect(outcome.kind).toBe("produced-many");
    expect(outcome.artifacts[0].artifact.kind).toBe("List<Json>");
    expect(JSON.parse(store.all()[0].content)).toEqual({
      items: [
        { format: "json", body: '{"file":"a.tsx"}' },
        { format: "json", body: '{"file":"b.tsx"}' },
      ],
    });
  });

  it("emits a legacy MarkdownList when itemKind=Markdown (objects pretty-printed)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        transformations: [
          { port: "files", expression: "$.byFile[*]", wrap: "list", itemKind: "Markdown" },
        ],
      },
      inputs: [jsonInput('{"byFile":[{"file":"a.tsx","findings":[1]},{"file":"b.tsx","findings":[]}]}')],
      store,
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced-many" }
    >;
    expect(outcome.artifacts[0].artifact.kind).toBe("MarkdownList");
    const persisted = JSON.parse(store.all()[0].content) as {
      format: string;
      bodies: string[];
    };
    expect(persisted.format).toBe("markdown-list");
    expect(persisted.bodies).toHaveLength(2);
    expect(JSON.parse(persisted.bodies[0])).toEqual({ file: "a.tsx", findings: [1] });
  });

  it("resolveSpec declares a MarkdownList output for itemKind=Markdown", () => {
    const spec = runner.resolveSpec({
      config: {
        transformations: [{ port: "f", expression: "$[*]", wrap: "list", itemKind: "Markdown" }],
      },
    });
    expect(spec.outputs[0]).toMatchObject({ name: "f", kind: "MarkdownList" });
  });

  it("rejects an invalid itemKind", () => {
    expect(() =>
      runner.resolveSpec({
        config: { transformations: [{ port: "p", expression: "$", wrap: "list", itemKind: "Path" }] },
      }),
    ).toThrowError(/`itemKind` must be one of/);
  });

  it("rejects a wrap value other than \"list\"", () => {
    expect(() =>
      runner.resolveSpec({
        config: { transformations: [{ port: "p", expression: "$", wrap: "set" }] },
      }),
    ).toThrowError(/`wrap` must be "list"/);
  });

  it("keeps emitting a single Json (body = matches array) without wrap", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { transformations: [{ port: "out", expression: "$[*].file" }] },
      inputs: [jsonInput('[{"file":"a.tsx"},{"file":"b.tsx"}]')],
      store,
    });
    await runner.run(ctx);
    expect(store.all()[0].kind).toBe("Json");
    expect(JSON.parse(store.all()[0].content)).toEqual({
      format: "json",
      body: JSON.stringify(["a.tsx", "b.tsx"]),
    });
  });
});

describe("json.transform — fenced input", () => {
  it("strips a Markdown code fence (shell.exec stdout) before parsing", async () => {
    const store = createStubArtifactStore();
    const fenced = '```\n[{"file":"a.tsx"}]\n```\n';
    const ctx = buildCtx({
      config: { transformations: [{ port: "items", expression: "$[*]", wrap: "list" }] },
      inputs: [jsonInput(fenced)],
      store,
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced-many" }
    >;
    expect(JSON.parse(store.all()[0].content)).toEqual({
      items: [{ format: "json", body: '{"file":"a.tsx"}' }],
    });
    expect(outcome.artifacts[0].artifact.kind).toBe("List<Json>");
  });
});
