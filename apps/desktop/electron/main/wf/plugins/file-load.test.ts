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
import type { FileSystemPort } from "../application/ports/outbound/file-system";
import type { PathPort } from "../application/ports/outbound/path";
import type {
  RunContext,
  RunContextInput,
} from "../application/step-runner";
import { ArtifactSchemaError } from "../domain/artifact-errors";
import { createFileLoadRunner } from "./file-load";

// --- Test doubles ---------------------------------------------------------

type Recorded = {
  kind: ArtifactKind;
  content: string;
  metadata: Record<string, string>;
};

type StubStore = ArtifactStore & { last: () => Recorded | null };

/** Mirrors the real store: validates the `{ format, body }` envelope. */
const createStubArtifactStore = (): StubStore => {
  let last: Recorded | null = null;
  const formatFor: Record<string, string> = {
    Markdown: "markdown",
    Json: "json",
  };
  return {
    async put(kind, content, metadata = {}): Promise<Artifact> {
      const expected = formatFor[kind];
      if (expected) {
        const p = JSON.parse(content) as { format?: string; body?: string };
        if (p.format !== expected || !p.body) {
          throw new ArtifactSchemaError(kind, []);
        }
      }
      last = { kind, content, metadata };
      return {
        id: asArtifactId("artifact-1"),
        kind,
        hash: asArtifactHash("hash-1"),
        storageRef: "stub",
        metadata,
        createdAt: "2026-05-26T00:00:00.000Z",
      };
    },
    async get() {
      throw new Error("not implemented");
    },
    async getByHash() {
      return null;
    },
    last: () => last,
  };
};

/**
 * POSIX-style path port mimicking `path.resolve`: an already-absolute path
 * resolves to itself, a relative one gets anchored under a fake cwd (so it
 * differs from the input and trips the absolute-path guard).
 */
const stubPath: PathPort = {
  resolve: (...segments: ReadonlyArray<string>) => {
    const joined = segments.join("/");
    return joined.startsWith("/") ? joined : `/cwd/${joined}`;
  },
  sep: "/",
};

const createStubFs = (files: Record<string, string>): FileSystemPort => ({
  async readTextFile(absolutePath: string): Promise<string> {
    const body = files[absolutePath];
    if (body === undefined) throw new Error(`ENOENT: ${absolutePath}`);
    return body;
  },
});

const buildCtx = (params: {
  config: Record<string, unknown>;
  inputs?: ReadonlyArray<RunContextInput>;
  store: ArtifactStore;
  files?: Record<string, string>;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-1"),
  step: {
    id: asStepId("step-1"),
    name: "load",
    kind: "file.load",
    actorRole: "Developer",
    config: params.config,
    humanGateRequired: false,
  },
  inputs: params.inputs ?? [],
  loopHistory: [],
  attempt: 0,
  workspace: {},
  deps: {
    artifactStore: params.store,
    path: stubPath,
    fs: createStubFs(params.files ?? {}),
    // Remaining ports are unused by `file.load`; cast to keep the test focused.
    llm: undefined as never,
    linear: undefined as never,
    shell: undefined as never,
    runLog: undefined as never,
    clock: undefined as never,
    ids: undefined as never,
    llmSession: undefined as never,
    logger: undefined as never,
    hash: undefined as never,
    environment: undefined as never,
  },
});

const pathInput = (path: string): RunContextInput => ({
  port: "path",
  kind: "Path",
  content: JSON.stringify({ path }),
  payload: { path },
  artifactId: asArtifactId("path-art"),
});

const runner = createFileLoadRunner();

// --- resolveSpec ----------------------------------------------------------

describe("file.load — resolveSpec", () => {
  it("emits no output port until outputKind is chosen", () => {
    const spec = runner.resolveSpec({ config: {} });
    expect(spec.outputs).toEqual([]);
    expect(spec.inputs.map((p) => p.name)).toEqual(["path"]);
  });

  it("derives the output port from config.outputKind", () => {
    const spec = runner.resolveSpec({ config: { outputKind: "Json" } });
    expect(spec.outputs).toEqual([
      { name: "out", kind: "Json", primary: true },
    ]);
  });

  it("ignores an unsupported outputKind in the signature", () => {
    const spec = runner.resolveSpec({ config: { outputKind: "Path" } });
    expect(spec.outputs).toEqual([]);
  });
});

// --- run ------------------------------------------------------------------

describe("file.load — run", () => {
  it("loads a Markdown file from config.path", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { path: "/docs/spec.md", outputKind: "Markdown" },
      store,
      files: { "/docs/spec.md": "# Hello\n" },
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced");
    const recorded = store.last();
    expect(recorded?.kind).toBe("Markdown");
    expect(JSON.parse(recorded!.content)).toEqual({
      format: "markdown",
      body: "# Hello\n",
    });
    expect(recorded?.metadata.source).toBe("file.load");
    expect(recorded?.metadata.path).toBe("/docs/spec.md");
  });

  it("loads a valid JSON file as a Json artifact", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { path: "/data/x.json", outputKind: "Json" },
      store,
      files: { "/data/x.json": '{"a":1}' },
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced");
    expect(store.last()?.kind).toBe("Json");
    expect(JSON.parse(store.last()!.content)).toEqual({
      format: "json",
      body: '{"a":1}',
    });
  });

  it("fails on malformed JSON", async () => {
    const ctx = buildCtx({
      config: { path: "/data/bad.json", outputKind: "Json" },
      store: createStubArtifactStore(),
      files: { "/data/bad.json": "{not json" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/not valid JSON/);
  });

  it("path from the input wins over config.path", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { path: "/from/config.md", outputKind: "Markdown" },
      inputs: [pathInput("/from/input.md")],
      store,
      files: {
        "/from/config.md": "config",
        "/from/input.md": "input",
      },
    });
    await runner.run(ctx);
    expect(store.last()?.metadata.path).toBe("/from/input.md");
  });

  it("throws when neither input nor config provides a path", async () => {
    const ctx = buildCtx({
      config: { outputKind: "Markdown" },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/no path/);
  });

  it("requires config.outputKind", async () => {
    const ctx = buildCtx({
      config: { path: "/x.md" },
      store: createStubArtifactStore(),
      files: { "/x.md": "x" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/outputKind/);
  });

  it("rejects an unsupported outputKind", async () => {
    const ctx = buildCtx({
      config: { path: "/x.md", outputKind: "Path" },
      store: createStubArtifactStore(),
      files: { "/x.md": "x" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/unsupported outputKind/);
  });

  it("fails on an empty file", async () => {
    const ctx = buildCtx({
      config: { path: "/empty.md", outputKind: "Markdown" },
      store: createStubArtifactStore(),
      files: { "/empty.md": "" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/empty/);
  });

  it("rejects a non-absolute path", async () => {
    const ctx = buildCtx({
      config: { path: "relative/x.md", outputKind: "Markdown" },
      store: createStubArtifactStore(),
      files: { "relative/x.md": "x" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/must be absolute/);
  });
});
