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
  StepOutcome,
} from "../application/step-runner";
import { ArtifactSchemaError } from "../domain/artifact-errors";
import { createFilesLoadManifestRunner } from "./files-load-manifest";

// --- Test doubles ---------------------------------------------------------

type Recorded = {
  kind: ArtifactKind;
  content: string;
  metadata: Record<string, string>;
};

type StubStore = ArtifactStore & { all: () => ReadonlyArray<Recorded> };

/**
 * Mirrors the real store: validates the `{ format, body }` envelope. Unlike the
 * `files.load` stub, an **empty** Markdown body is accepted — a manifest that
 * matches 0 files legitimately emits an empty Markdown artifact.
 */
const createStubArtifactStore = (): StubStore => {
  const recorded: Recorded[] = [];
  const formatFor: Record<string, string> = {
    Markdown: "markdown",
    Json: "json",
  };
  let n = 0;
  return {
    async put(kind, content, metadata = {}): Promise<Artifact> {
      const expected = formatFor[kind];
      if (expected) {
        const p = JSON.parse(content) as { format?: string; body?: string };
        const bodyOk =
          kind === "Markdown" ? typeof p.body === "string" : !!p.body;
        if (p.format !== expected || !bodyOk) {
          throw new ArtifactSchemaError(kind, []);
        }
      }
      recorded.push({ kind, content, metadata });
      n += 1;
      return {
        id: asArtifactId(`artifact-${n}`),
        kind,
        hash: asArtifactHash(`hash-${n}`),
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
    all: () => recorded,
  };
};

const normalizePosix = (p: string): string => {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return "/" + parts.join("/");
};

const stubPath: PathPort = {
  resolve: (...segments: ReadonlyArray<string>) => {
    let from = 0;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].startsWith("/")) {
        from = i;
        break;
      }
    }
    const head = segments[from]?.startsWith("/") ? "" : "/cwd";
    const joined = `${head}/${segments.slice(from).join("/")}`;
    return normalizePosix(joined);
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

const sourceInput = (json: unknown): RunContextInput => {
  const body = typeof json === "string" ? json : JSON.stringify(json);
  return {
    port: "source",
    kind: "Json",
    content: JSON.stringify({ format: "json", body }),
    payload: { format: "json", body } as never,
    artifactId: asArtifactId("source-art"),
  };
};

const pathInput = (path: string): RunContextInput => ({
  port: "path",
  kind: "Path",
  content: JSON.stringify({ path }),
  payload: { path } as never,
  artifactId: asArtifactId("path-art"),
});

const buildCtx = (params: {
  config: Record<string, unknown>;
  inputs: ReadonlyArray<RunContextInput>;
  store: ArtifactStore;
  files?: Record<string, string>;
  path?: PathPort;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-1"),
  step: {
    id: asStepId("step-1"),
    name: "manifest",
    kind: "files.load-manifest",
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
    path: params.path ?? stubPath,
    fs: createStubFs(params.files ?? {}),
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

const bodyOf = (outcome: StepOutcome, store: StubStore): string => {
  if (outcome.kind !== "produced") {
    throw new Error(`expected produced, got ${outcome.kind}`);
  }
  // The last Markdown artifact recorded is the concatenated output.
  const md = [...store.all()].reverse().find((r) => r.kind === "Markdown");
  if (!md) throw new Error("no Markdown artifact recorded");
  return (JSON.parse(md.content) as { body: string }).body;
};

const runner = createFilesLoadManifestRunner();

// --- resolveSpec ----------------------------------------------------------

describe("files.load-manifest — resolveSpec", () => {
  it("returns the static ports without throwing on empty config", () => {
    const spec = runner.resolveSpec({ config: {} });
    expect(spec.inputs.map((p) => p.name)).toEqual(["source", "path"]);
    expect(spec.outputs).toEqual([
      { name: "out", kind: "Markdown", primary: true },
    ]);
  });
});

// --- run ------------------------------------------------------------------

describe("files.load-manifest — run", () => {
  it("loads the named files in selector order and concatenates them", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        selector: "$.mockups[*].transcription",
        wrap: { header: "<f={name}>", footer: "</f>" },
        outputKind: "Json",
      },
      inputs: [
        sourceInput({
          mockups: [
            { transcription: "a.json" },
            { transcription: "b.json" },
          ],
        }),
        pathInput("/base"),
      ],
      store,
      files: {
        "/base/a.json": '{"a":1}',
        "/base/b.json": '{"b":2}',
      },
    });
    const out = await runner.run(ctx);
    expect(out.kind).toBe("produced");
    expect(bodyOf(out, store)).toBe(
      '<f=a.json>{"a":1}</f>\n\n<f=b.json>{"b":2}</f>',
    );
  });

  it("emits an empty Markdown when the selector matches nothing", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { selector: "$.mockups[*].transcription" },
      inputs: [sourceInput({ mockups: [] }), pathInput("/base")],
      store,
    });
    const out = await runner.run(ctx);
    expect(out.kind).toBe("produced");
    expect(bodyOf(out, store)).toBe("");
  });

  it("de-duplicates repeated names (loads the file once)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        selector: "$.names[*]",
        outputKind: "Markdown",
        wrap: { header: "[", footer: "]" },
      },
      inputs: [
        sourceInput({ names: ["x.md", "x.md", "y.md"] }),
        pathInput("/base"),
      ],
      store,
      files: { "/base/x.md": "X", "/base/y.md": "Y" },
    });
    const out = await runner.run(ctx);
    expect(bodyOf(out, store)).toBe("[X]\n\n[Y]");
  });

  it("keeps duplicates when dedupe is false", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        selector: "$.names[*]",
        outputKind: "Markdown",
        dedupe: false,
      },
      inputs: [
        sourceInput({ names: ["x.md", "x.md"] }),
        pathInput("/base"),
      ],
      store,
      files: { "/base/x.md": "X" },
    });
    const out = await runner.run(ctx);
    expect(bodyOf(out, store)).toBe("X\n\nX");
  });

  it("fails when the selector matches a non-string entry", async () => {
    const ctx = buildCtx({
      config: { selector: "$.mockups[*]" },
      inputs: [
        sourceInput({ mockups: [{ transcription: "a.json" }] }),
        pathInput("/base"),
      ],
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/non-string entry/);
  });

  it("rejects a name that escapes the base via `..`", async () => {
    const ctx = buildCtx({
      config: { selector: "$.names[*]" },
      inputs: [
        sourceInput({ names: ["../secret.json"] }),
        pathInput("/base"),
      ],
      store: createStubArtifactStore(),
      files: { "/secret.json": '{"leak":1}' },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/escapes the base directory/);
  });

  it("rejects an absolute name", async () => {
    const ctx = buildCtx({
      config: { selector: "$.names[*]" },
      inputs: [
        sourceInput({ names: ["/etc/passwd"] }),
        pathInput("/base"),
      ],
      store: createStubArtifactStore(),
      files: { "/etc/passwd": "root:x" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/escapes the base directory/);
  });

  it("resolves names under subdir", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        selector: "$.names[*]",
        subdir: "mockups",
        outputKind: "Markdown",
      },
      inputs: [sourceInput({ names: ["a.md"] }), pathInput("/base")],
      store,
      files: { "/base/mockups/a.md": "A" },
    });
    const out = await runner.run(ctx);
    expect(bodyOf(out, store)).toBe("A");
    expect(
      store.all().find((r) => r.metadata.source === "files.load-manifest"),
    ).toBeTruthy();
  });

  it("fails on a missing file when onMissing is fail (default)", async () => {
    const ctx = buildCtx({
      config: { selector: "$.names[*]", outputKind: "Markdown" },
      inputs: [
        sourceInput({ names: ["a.md", "gone.md"] }),
        pathInput("/base"),
      ],
      store: createStubArtifactStore(),
      files: { "/base/a.md": "A" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/ENOENT/);
  });

  it("skips a missing file when onMissing is skip, keeps the others", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        selector: "$.names[*]",
        outputKind: "Markdown",
        onMissing: "skip",
      },
      inputs: [
        sourceInput({ names: ["a.md", "gone.md", "b.md"] }),
        pathInput("/base"),
      ],
      store,
      files: { "/base/a.md": "A", "/base/b.md": "B" },
    });
    const out = await runner.run(ctx);
    expect(bodyOf(out, store)).toBe("A\n\nB");
  });

  it("fails early on malformed JSON when outputKind is Json", async () => {
    const ctx = buildCtx({
      config: { selector: "$.names[*]", outputKind: "Json" },
      inputs: [sourceInput({ names: ["bad.json"] }), pathInput("/base")],
      store: createStubArtifactStore(),
      files: { "/base/bad.json": "{not json" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/not valid JSON/);
  });

  it("fails when no base path is wired", async () => {
    const ctx = buildCtx({
      config: { selector: "$.names[*]" },
      inputs: [sourceInput({ names: ["a.md"] })],
      store: createStubArtifactStore(),
      files: { "/base/a.md": "A" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/no base directory/);
  });

  it("fails when the base path is not absolute", async () => {
    const ctx = buildCtx({
      config: { selector: "$.names[*]" },
      inputs: [sourceInput({ names: ["a.md"] }), pathInput("relative/base")],
      store: createStubArtifactStore(),
      files: { "/cwd/relative/base/a.md": "A" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/must be absolute/);
  });

  it("joins raw bodies when no wrap is configured", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { selector: "$.names[*]", outputKind: "Markdown" },
      inputs: [
        sourceInput({ names: ["a.md", "b.md"] }),
        pathInput("/base"),
      ],
      store,
      files: { "/base/a.md": "A", "/base/b.md": "B" },
    });
    const out = await runner.run(ctx);
    expect(bodyOf(out, store)).toBe("A\n\nB");
  });

  it("enforces maxFiles after dedupe", async () => {
    const ctx = buildCtx({
      config: { selector: "$.names[*]", maxFiles: 1, outputKind: "Markdown" },
      inputs: [
        sourceInput({ names: ["a.md", "b.md"] }),
        pathInput("/base"),
      ],
      store: createStubArtifactStore(),
      files: { "/base/a.md": "A", "/base/b.md": "B" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/maxFiles/);
  });

  it("fails when the source input is not valid JSON", async () => {
    const ctx = buildCtx({
      config: { selector: "$.names[*]" },
      inputs: [sourceInput("not json {"), pathInput("/base")],
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/not valid JSON/);
  });

  it("tolerates a fenced source (shell.exec stdout)", async () => {
    const store = createStubArtifactStore();
    const fenced = '```json\n{"names":["a.md"]}\n```';
    const ctx = buildCtx({
      config: { selector: "$.names[*]", outputKind: "Markdown" },
      inputs: [sourceInput(fenced), pathInput("/base")],
      store,
      files: { "/base/a.md": "A" },
    });
    const out = await runner.run(ctx);
    expect(bodyOf(out, store)).toBe("A");
  });

  it("substitutes {name} in both header and footer", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        selector: "$.names[*]",
        outputKind: "Markdown",
        wrap: { header: "<{name}>", footer: "</{name}>" },
      },
      inputs: [sourceInput({ names: ["a.md"] }), pathInput("/base")],
      store,
      files: { "/base/a.md": "A" },
    });
    const out = await runner.run(ctx);
    expect(bodyOf(out, store)).toBe("<a.md>A</a.md>");
  });
});
