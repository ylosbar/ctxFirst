import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asArtifactHash,
  asArtifactId,
  asStepExecId,
  asStepId,
  asWorkflowId,
} from "../domain/ids";
import type { Artifact, ArtifactKind } from "../domain/artifact";
import type { ArtifactStore } from "../application/ports/outbound/artifact-store";
import type { EnvironmentPort } from "../application/ports/outbound/environment";
import type { LoggerPort } from "../application/ports/outbound/logger";
import type {
  ProducedSlot,
  RunContext,
  RunContextInput,
  StepOutcome,
} from "../application/step-runner";
import { ArtifactSchemaError } from "../domain/artifact-errors";
import {
  createGitlabFilesFetchRunner,
  joinRepoPath,
} from "./gitlab-files-fetch";

// --- Test doubles ---------------------------------------------------------

const stubLogger: LoggerPort = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

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

type ResponseLike = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

const makeResponse = (
  body: string,
  init: { ok?: boolean; status?: number } = {},
): ResponseLike => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  text: async () => body,
});

/**
 * `fetch` mock keyed by the decoded repo file path (the segment between
 * `/files/` and `/raw`). Lets each test declare the raw bodies it serves
 * without caring about query string / encoding details.
 */
const fetchByFilePath = (
  files: Record<string, ResponseLike>,
): ReturnType<typeof vi.fn> =>
  vi.fn(async (url: string) => {
    const enc = /\/files\/([^/]+)\/raw/.exec(url)?.[1];
    const filePath = enc ? decodeURIComponent(enc) : "";
    const res = files[filePath];
    if (!res) return makeResponse("not found", { ok: false, status: 404 });
    return res;
  });

const emptyEnvironment: EnvironmentPort = { read: () => ({}) };

const buildCtx = (params: {
  config: Record<string, unknown>;
  inputs?: ReadonlyArray<RunContextInput>;
  store: ArtifactStore;
  environment?: EnvironmentPort;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-1"),
  step: {
    id: asStepId("step-1"),
    name: "fetch",
    kind: "gitlab.files.fetch",
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
    logger: stubLogger,
    environment: params.environment ?? emptyEnvironment,
    // Remaining ports are unused by `gitlab.files.fetch`; cast to keep the
    // test focused without dragging unrelated fakes in.
    llm: undefined as never,
    linear: undefined as never,
    shell: undefined as never,
    runLog: undefined as never,
    clock: undefined as never,
    ids: undefined as never,
    llmSession: undefined as never,
    hash: undefined as never,
    path: undefined as never,
    fs: undefined as never,
  },
});

const jsonInput = (port: string, payload: Record<string, unknown>): RunContextInput => ({
  port,
  kind: "Json",
  content: JSON.stringify({ format: "json", body: JSON.stringify(payload) }),
  payload,
  artifactId: asArtifactId("in-art"),
});

const slotsOf = (outcome: StepOutcome): ReadonlyArray<ProducedSlot> => {
  if (outcome.kind !== "produced-many") {
    throw new Error(`expected produced-many, got ${outcome.kind}`);
  }
  return outcome.artifacts;
};

// A runner whose token always resolves from settings (no env fallback needed).
const runner = createGitlabFilesFetchRunner({ getAccessToken: () => "tok-123" });

// --- joinRepoPath (unit) --------------------------------------------------

describe("gitlab.files.fetch — joinRepoPath", () => {
  it("joins POSIX segments under the base, dropping `.` and empty parts", () => {
    expect(joinRepoPath("docs", "spec.md")).toBe("docs/spec.md");
    expect(joinRepoPath("docs", "api/openapi.json")).toBe(
      "docs/api/openapi.json",
    );
    expect(joinRepoPath("", "CLAUDE.md")).toBe("CLAUDE.md");
    expect(joinRepoPath("docs/", "/./sub//file.md")).toBe("docs/sub/file.md");
  });

  it("throws when a subpath escapes the base path via `..`", () => {
    expect(() => joinRepoPath("docs", "../README.md")).toThrow(
      /escapes the base path/,
    );
    expect(() => joinRepoPath("docs", "../../etc")).toThrow(
      /escapes the base path/,
    );
  });

  it("allows `..` that stays within the base", () => {
    expect(joinRepoPath("docs", "api/../spec.md")).toBe("docs/spec.md");
  });
});

// --- resolveSpec ----------------------------------------------------------

describe("gitlab.files.fetch — resolveSpec", () => {
  it("emits one named output port per slot, kinds and order preserved", () => {
    const spec = runner.resolveSpec({
      config: {
        project: "g/p",
        slots: [
          { port: "spec", subpath: "spec.md", outputKind: "Markdown" },
          { port: "data", subpath: "api.json", outputKind: "Json" },
        ],
      },
    });
    expect(spec.inputs.map((p) => p.name)).toEqual(["in"]);
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
  });

  it("stays permissive (no output) on empty / incomplete config", () => {
    expect(runner.resolveSpec({ config: {} }).outputs).toEqual([]);
    expect(runner.resolveSpec({ config: { slots: [] } }).outputs).toEqual([]);
    expect(
      runner.resolveSpec({
        config: { slots: [{ port: "out", subpath: "x", outputKind: "Path" }] },
      }).outputs,
    ).toEqual([]);
  });
});

// --- run ------------------------------------------------------------------

describe("gitlab.files.fetch — run", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a single Markdown file into one named port", async () => {
    vi.stubGlobal(
      "fetch",
      fetchByFilePath({ "docs/spec.md": makeResponse("# Hello\n") }),
    );
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        project: "group/project",
        ref: "main",
        basePath: "docs",
        slots: [{ port: "out", subpath: "spec.md", outputKind: "Markdown" }],
      },
      store,
    });

    const slots = slotsOf(await runner.run(ctx));
    expect(slots.map((s) => s.port)).toEqual(["out"]);

    const recorded = store.all();
    expect(recorded[0].kind).toBe("Markdown");
    expect(JSON.parse(recorded[0].content)).toEqual({
      format: "markdown",
      body: "# Hello\n",
    });
    expect(recorded[0].metadata.source).toBe("gitlab.files.fetch");
    expect(recorded[0].metadata.project).toBe("group/project");
    expect(recorded[0].metadata.ref).toBe("main");
    expect(recorded[0].metadata.filePath).toBe("docs/spec.md");
  });

  it("fetches N files preserving slot order", async () => {
    vi.stubGlobal(
      "fetch",
      fetchByFilePath({
        "spec.md": makeResponse("# Spec\n"),
        "api.json": makeResponse('{"a":1}'),
      }),
    );
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        project: "g/p",
        slots: [
          { port: "spec", subpath: "spec.md", outputKind: "Markdown" },
          { port: "data", subpath: "api.json", outputKind: "Json" },
        ],
      },
      store,
    });
    const slots = slotsOf(await runner.run(ctx));
    expect(slots.map((s) => s.port)).toEqual(["spec", "data"]);
    expect(store.all().map((r) => r.kind)).toEqual(["Markdown", "Json"]);
  });

  it("URL-encodes the joined file path (slashes become %2F) and pins ?ref", async () => {
    const fetchMock = fetchByFilePath({
      "docs/api/openapi.json": makeResponse('{"ok":true}'),
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = buildCtx({
      config: {
        project: "group/project",
        ref: "v1.2.3",
        basePath: "docs",
        slots: [
          { port: "out", subpath: "api/openapi.json", outputKind: "Json" },
        ],
      },
      store: createStubArtifactStore(),
    });
    await runner.run(ctx);
    const url = fetchMock.mock.calls[0][0] as string;
    // project path and file path are both fully encoded.
    expect(url).toContain("/projects/group%2Fproject/");
    expect(url).toContain("/files/docs%2Fapi%2Fopenapi.json/raw");
    expect(url).toContain("?ref=v1.2.3");
  });

  it("omits the ref query param when ref is empty", async () => {
    const fetchMock = fetchByFilePath({ "spec.md": makeResponse("# x\n") });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = buildCtx({
      config: {
        project: "g/p",
        slots: [{ port: "out", subpath: "spec.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
    });
    await runner.run(ctx);
    expect(fetchMock.mock.calls[0][0] as string).not.toContain("ref=");
  });

  it("project from the `in` input wins over config", async () => {
    const fetchMock = fetchByFilePath({ "spec.md": makeResponse("# x\n") });
    vi.stubGlobal("fetch", fetchMock);
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        project: "from/config",
        slots: [{ port: "out", subpath: "spec.md", outputKind: "Markdown" }],
      },
      inputs: [jsonInput("in", { project: "from/input" })],
      store,
    });
    await runner.run(ctx);
    expect(fetchMock.mock.calls[0][0] as string).toContain(
      "/projects/from%2Finput/",
    );
    expect(store.all()[0].metadata.project).toBe("from/input");
  });

  it("throws when no project is provided (config nor input)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = buildCtx({
      config: {
        slots: [{ port: "out", subpath: "spec.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/missing `project`/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails early on a non-JSON body for a Json slot", async () => {
    vi.stubGlobal(
      "fetch",
      fetchByFilePath({ "data.json": makeResponse("<html>nope</html>") }),
    );
    const ctx = buildCtx({
      config: {
        project: "g/p",
        slots: [{ port: "out", subpath: "data.json", outputKind: "Json" }],
      },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/not valid JSON/);
  });

  it("404 surfaces a clear error naming the file and ref", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeResponse("Not Found", { ok: false, status: 404 })),
    );
    const ctx = buildCtx({
      config: {
        project: "g/p",
        ref: "main",
        basePath: "docs",
        slots: [{ port: "out", subpath: "missing.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(
      /file not found "docs\/missing\.md" at ref "main"/,
    );
  });

  it("surfaces other non-ok HTTP statuses with the body excerpt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeResponse("boom", { ok: false, status: 500 })),
    );
    const ctx = buildCtx({
      config: {
        project: "g/p",
        slots: [{ port: "out", subpath: "spec.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/HTTP 500 fetching/);
  });

  it("rejects an escaping subpath before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = buildCtx({
      config: {
        project: "g/p",
        basePath: "docs",
        slots: [{ port: "out", subpath: "../secret.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/escapes the base path/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when no token is available (neither settings nor env)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // Runner without `getAccessToken`, env with no GITLAB_TOKEN.
    const tokenlessRunner = createGitlabFilesFetchRunner();
    const ctx = buildCtx({
      config: {
        project: "g/p",
        slots: [{ port: "out", subpath: "spec.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
      environment: emptyEnvironment,
    });
    await expect(tokenlessRunner.run(ctx)).rejects.toThrow(
      /no GitLab access token/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the token via the PRIVATE-TOKEN header, never in the URL", async () => {
    const fetchMock = fetchByFilePath({ "spec.md": makeResponse("# x\n") });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = buildCtx({
      config: {
        project: "g/p",
        slots: [{ port: "out", subpath: "spec.md", outputKind: "Markdown" }],
      },
      store: createStubArtifactStore(),
    });
    await runner.run(ctx);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers["PRIVATE-TOKEN"]).toBe("tok-123");
    expect(url).not.toContain("tok-123");
  });
});
