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
import type { ArtifactSchemaRegistry } from "../application/ports/outbound/artifact-schema-registry";
import type {
  RunContext,
  RunContextInput,
  StepOutcome,
} from "../application/step-runner";
import { createRenderMarkdownRunner } from "./render-markdown";

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

/** Minimal registry stub: returns the descriptor registered for a kind, else null. */
const stubRegistry = (
  byKind: Record<string, { markdownProjection: unknown }>,
): ArtifactSchemaRegistry =>
  ({
    resolve: (kind: ArtifactKind) => byKind[kind] ?? null,
  }) as unknown as ArtifactSchemaRegistry;

const buildCtx = (params: {
  input: RunContextInput;
  store: ArtifactStore;
  artifactSchemas?: ArtifactSchemaRegistry;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-render"),
  step: {
    id: asStepId("step-render"),
    name: "render",
    kind: "render.markdown",
    actorRole: "Developer",
    config: {},
    humanGateRequired: false,
  },
  inputs: [params.input],
  loopHistory: [],
  attempt: 0,
  workspace: {},
  deps: {
    artifactStore: params.store,
    artifactSchemas: params.artifactSchemas,
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

const input = (
  kind: ArtifactKind,
  payload: unknown,
  content?: string,
): RunContextInput => ({
  port: "in",
  kind,
  content: content ?? JSON.stringify(payload),
  payload: payload,
  artifactId: asArtifactId("upstream-1"),
});

const runner = createRenderMarkdownRunner();

describe("render.markdown", () => {
  it("declares a wildcard input and a Markdown output", () => {
    const spec = runner.resolveSpec({ config: {} });
    expect(spec.inputs[0]).toMatchObject({ name: "in", kinds: ["*"] });
    expect(spec.outputs[0]).toMatchObject({ name: "out", kind: "Markdown" });
  });

  it("projects a user kind through its template projection", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      input: input("user:foo@v1", { title: "Hi", summary: "There" }),
      store,
      artifactSchemas: stubRegistry({
        "user:foo@v1": {
          markdownProjection: {
            kind: "template",
            template: "## {{title}}\n{{summary}}",
          },
        },
      }),
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced" }
    >;
    expect(outcome.kind).toBe("produced");
    expect(outcome.artifact.kind).toBe("Markdown");
    expect(JSON.parse(store.all()[0].content)).toEqual({
      format: "markdown",
      body: "## Hi\nThere",
    });
  });

  it("falls back to a fenced JSON block for a structured kind without projection", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      input: input("user:bar@v1", { a: 1 }),
      store,
      artifactSchemas: stubRegistry({
        "user:bar@v1": { markdownProjection: null },
      }),
    });
    await runner.run(ctx);
    expect(JSON.parse(store.all()[0].content)).toEqual({
      format: "markdown",
      body: '```json\n{\n  "a": 1\n}\n```',
    });
  });

  it("passes a Json envelope body through (unknown kind / no registry)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      input: input("Json", { format: "json", body: '{"x":1}' }),
      store,
    });
    await runner.run(ctx);
    expect(JSON.parse(store.all()[0].content)).toEqual({
      format: "markdown",
      body: '{"x":1}',
    });
  });

  it("uses an embedded renderedMarkdown field (Ticket pattern, no projection)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      input: input("plugin:linear:Ticket@v1", {
        renderedMarkdown: "# Ticket",
        id: "ABC-1",
      }),
      store,
    });
    await runner.run(ctx);
    expect(JSON.parse(store.all()[0].content)).toEqual({
      format: "markdown",
      body: "# Ticket",
    });
  });

  it("records provenance metadata", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      input: input("Json", { format: "json", body: "{}" }),
      store,
    });
    await runner.run(ctx);
    expect(store.all()[0].metadata).toMatchObject({
      source: "render.markdown",
      srcKind: "Json",
      srcArtifactId: "upstream-1",
    });
  });
});
