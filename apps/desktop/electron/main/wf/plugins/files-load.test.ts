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
  ProducedSlot,
  RunContext,
  RunContextInput,
  StepOutcome,
} from "../application/step-runner";
import { ArtifactSchemaError } from "../domain/artifact-errors";
import { createFilesLoadRunner } from "./files-load";

// --- Test doubles ---------------------------------------------------------

type Recorded = {
  kind: ArtifactKind;
  content: string;
  metadata: Record<string, string>;
};

type StubStore = ArtifactStore & { all: () => ReadonlyArray<Recorded> };

/** Mirrors the real store: validates the `{ format, body }` envelope. */
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
        if (p.format !== expected || !p.body) {
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

/**
 * POSIX-style path port mimicking `path.resolve`: joins segments, anchors a
 * relative result under a fake cwd (so a relative base trips the absolute
 * guard) and normalises `..` segments so containment can be exercised.
 */
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
    // Mimic `path.resolve`: scan right-to-left, an absolute segment resets the
    // accumulation; fall back to a fake cwd when none is absolute.
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

/** Windows-style path port — backslash separator, drive-letter absolutes. */
const normalizeWin = (p: string): string => {
  const drive = /^[a-zA-Z]:/.exec(p)?.[0] ?? "C:";
  const rest = p.slice(drive.length);
  const parts: string[] = [];
  for (const seg of rest.split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return `${drive}\\${parts.join("\\")}`;
};

const stubWinPath: PathPort = {
  resolve: (...segments: ReadonlyArray<string>) => {
    const isAbs = (s: string): boolean => /^[a-zA-Z]:[\\/]/.test(s);
    let from = 0;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (isAbs(segments[i])) {
        from = i;
        break;
      }
    }
    const head = isAbs(segments[from] ?? "") ? "" : "C:\\cwd\\";
    return normalizeWin(`${head}${segments.slice(from).join("\\")}`);
  },
  sep: "\\",
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
  path?: PathPort;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-1"),
  step: {
    id: asStepId("step-1"),
    name: "load",
    kind: "files.load",
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
    path: params.path ?? stubPath,
    fs: createStubFs(params.files ?? {}),
    // Remaining ports are unused by `files.load`; cast to keep the test focused.
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

const slotsOf = (outcome: StepOutcome): ReadonlyArray<ProducedSlot> => {
  if (outcome.kind !== "produced-many") {
    throw new Error(`expected produced-many, got ${outcome.kind}`);
  }
  return outcome.artifacts;
};

const runner = createFilesLoadRunner();

// --- resolveSpec ----------------------------------------------------------

describe("files.load — resolveSpec", () => {
  it("emits one named output port per slot, kinds and order preserved", () => {
    const spec = runner.resolveSpec({
      config: {
        path: "/base",
        slots: [
          { port: "spec", subpath: "spec.md", outputKind: "Markdown" },
          { port: "data", subpath: "data.json", outputKind: "Json" },
        ],
      },
    });
    expect(spec.inputs.map((p) => p.name)).toEqual(["path"]);
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
  });

  it("stays permissive (no output) on empty / incomplete config", () => {
    expect(runner.resolveSpec({ config: {} }).outputs).toEqual([]);
    expect(runner.resolveSpec({ config: { slots: [] } }).outputs).toEqual([]);
    // An invalid slot (bad outputKind) makes the whole parse throw → outputs [].
    expect(
      runner.resolveSpec({
        config: { slots: [{ port: "out", subpath: "x", outputKind: "Path" }] },
      }).outputs,
    ).toEqual([]);
  });
});

// --- run ------------------------------------------------------------------

describe("files.load — run", () => {
  it("loads N files under the base into named slots (happy path)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        path: "/base",
        slots: [
          { port: "spec", subpath: "docs/spec.md", outputKind: "Markdown" },
          { port: "data", subpath: "data.json", outputKind: "Json" },
        ],
      },
      store,
      files: {
        "/base/docs/spec.md": "# Hello\n",
        "/base/data.json": '{"a":1}',
      },
    });
    const slots = slotsOf(await runner.run(ctx));
    expect(slots.map((s) => s.port)).toEqual(["spec", "data"]);

    const recorded = store.all();
    expect(recorded[0].kind).toBe("Markdown");
    expect(JSON.parse(recorded[0].content)).toEqual({
      format: "markdown",
      body: "# Hello\n",
    });
    expect(recorded[0].metadata.source).toBe("files.load");
    expect(recorded[0].metadata.path).toBe("/base/docs/spec.md");

    expect(recorded[1].kind).toBe("Json");
    expect(recorded[1].metadata.path).toBe("/base/data.json");
  });

  it("base from the input wins over config.path", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        path: "/from/config",
        slots: [{ port: "out", subpath: "x.md", outputKind: "Markdown" }],
      },
      inputs: [pathInput("/from/input")],
      store,
      files: {
        "/from/config/x.md": "config",
        "/from/input/x.md": "input",
      },
    });
    await runner.run(ctx);
    expect(store.all()[0].metadata.path).toBe("/from/input/x.md");
  });

  it("rejects a subpath that escapes the base via `..`", async () => {
    const ctx = buildCtx({
      config: {
        path: "/base",
        slots: [{ port: "out", subpath: "../secret.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
      files: { "/secret.md": "leak" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/escapes the base directory/);
  });

  it("rejects an absolute subpath (resolve ignores the base)", async () => {
    const ctx = buildCtx({
      config: {
        path: "/base",
        slots: [
          { port: "out", subpath: "/etc/passwd", outputKind: "Markdown" },
        ],
      },
      store: createStubArtifactStore(),
      files: { "/etc/passwd": "root:x" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/escapes the base directory/);
  });

  it("enforces containment on Windows-style paths too", async () => {
    const store = createStubArtifactStore();
    const ok = buildCtx({
      config: {
        path: "C:\\base",
        slots: [{ port: "out", subpath: "sub\\x.md", outputKind: "Markdown" }],
      },
      store,
      files: { "C:\\base\\sub\\x.md": "win" },
      path: stubWinPath,
    });
    const slots = slotsOf(await runner.run(ok));
    expect(slots).toHaveLength(1);

    const escaping = buildCtx({
      config: {
        path: "C:\\base",
        slots: [{ port: "out", subpath: "..\\secret.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
      files: { "C:\\secret.md": "leak" },
      path: stubWinPath,
    });
    await expect(runner.run(escaping)).rejects.toThrow(
      /escapes the base directory/,
    );
  });

  it("fails on malformed JSON in a Json slot", async () => {
    const ctx = buildCtx({
      config: {
        path: "/base",
        slots: [{ port: "out", subpath: "bad.json", outputKind: "Json" }],
      },
      store: createStubArtifactStore(),
      files: { "/base/bad.json": "{not json" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/not valid JSON/);
  });

  it("throws when neither input nor config provides a base", async () => {
    const ctx = buildCtx({
      config: { slots: [{ port: "out", subpath: "x.md", outputKind: "Markdown" }] },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/no base directory/);
  });

  it("rejects a non-absolute base", async () => {
    const ctx = buildCtx({
      config: {
        path: "relative/base",
        slots: [{ port: "out", subpath: "x.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
      files: { "/cwd/relative/base/x.md": "x" },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/must be absolute/);
  });

  it("rejects empty slots", async () => {
    const ctx = buildCtx({
      config: { path: "/base", slots: [] },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/requires config\.slots/);
  });

  it("rejects a duplicate port", async () => {
    const ctx = buildCtx({
      config: {
        path: "/base",
        slots: [
          { port: "out", subpath: "a.md", outputKind: "Markdown" },
          { port: "out", subpath: "b.md", outputKind: "Markdown" },
        ],
      },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/duplicate port/);
  });

  it("rejects an empty port name", async () => {
    const ctx = buildCtx({
      config: {
        path: "/base",
        slots: [{ port: "", subpath: "a.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/non-empty string/);
  });

  it("rejects an unsupported outputKind", async () => {
    const ctx = buildCtx({
      config: {
        path: "/base",
        slots: [{ port: "out", subpath: "a.md", outputKind: "Path" }],
      },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/unsupported outputKind/);
  });

  it("rejects an empty subpath", async () => {
    const ctx = buildCtx({
      config: {
        path: "/base",
        slots: [{ port: "out", subpath: "  ", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/non-empty subpath/);
  });
});
