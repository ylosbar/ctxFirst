import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  asArtifactHash,
  asArtifactId,
  asStepExecId,
  asStepId,
  asWorkflowId,
} from "../domain/ids";
import type { Artifact, ArtifactKind } from "../domain/artifact";
import type { ArtifactStore } from "../application/ports/outbound/artifact-store";
import type { LoggerPort } from "../application/ports/outbound/logger";
import type {
  RunContext,
  RunContextInput,
} from "../application/step-runner";
import { ArtifactSchemaError } from "../domain/artifact-errors";
import { buildRequest, createWebhookCallRunner } from "./webhook-call";

const stubLogger: LoggerPort = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

// The runner's "happy" output kind: a user-defined artifact type. We register a
// resolver so `putArtifactPayload` can validate the parsed JSON against it.
const RESPONSE_KIND = "user:webhook-response@1" as ArtifactKind;
const responseSchema = z.object({ ok: z.boolean(), id: z.number().int() });

// --- Test doubles ---------------------------------------------------------

type Recorded = {
  kind: ArtifactKind;
  content: string;
  metadata: Record<string, string>;
};

type StubStore = ArtifactStore & { last: () => Recorded | null };

const createStubArtifactStore = (): StubStore => {
  let last: Recorded | null = null;
  return {
    async put(kind, content, metadata = {}): Promise<Artifact> {
      // Mirror fs-store: validate the payload against the kind's schema before
      // committing. In §0 the registry is the only dispatch path — for the
      // sole dynamic kind exercised in this test, we validate inline.
      if (kind === RESPONSE_KIND) {
        const result = responseSchema.safeParse(JSON.parse(content));
        if (!result.success) {
          throw new ArtifactSchemaError(kind, result.error.issues);
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

const buildCtx = (params: {
  config: Record<string, unknown>;
  inputs?: ReadonlyArray<RunContextInput>;
  store: ArtifactStore;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-1"),
  step: {
    id: asStepId("step-1"),
    name: "webhook",
    kind: "webhook.call",
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
    // Remaining ports are unused by `webhook.call`; cast to keep the test
    // focused without dragging unrelated fakes in.
    llm: undefined as never,
    linear: undefined as never,
    shell: undefined as never,
    runLog: undefined as never,
    clock: undefined as never,
    ids: undefined as never,
    llmSession: undefined as never,
    hash: undefined as never,
    path: undefined as never,
    environment: undefined as never,
    fs: undefined as never,
  },
});

const markdownInput = (port: string, url: string): RunContextInput => ({
  port,
  kind: "Markdown",
  content: JSON.stringify({ format: "markdown", body: url }),
  payload: { format: "markdown", body: url },
  artifactId: asArtifactId("url-art"),
});

const rawInput = (port: string, content: string): RunContextInput => ({
  port,
  kind: "Markdown",
  content,
  payload: null,
  artifactId: asArtifactId("raw-art"),
});

const runner = createWebhookCallRunner();

// --- buildRequest (unit) --------------------------------------------------

describe("webhook.call — buildRequest", () => {
  it("GET drops the body even when one is provided", () => {
    const { init } = buildRequest({ method: "GET" }, "https://x.test", "body");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("POST adds Content-Type: application/json when absent", () => {
    const { init } = buildRequest({ method: "POST" }, "https://x.test", "{}");
    expect(init.body).toBe("{}");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("merges config.headers and respects an explicit Content-Type", () => {
    const { init } = buildRequest(
      { method: "POST", headers: { "Content-Type": "text/plain", "X-Foo": "1" } },
      "https://x.test",
      "raw",
    );
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("text/plain");
    expect(headers["X-Foo"]).toBe("1");
  });
});

// --- resolveSpec ----------------------------------------------------------

describe("webhook.call — resolveSpec", () => {
  it("emits no output port until outputKind is chosen", () => {
    const spec = runner.resolveSpec({ config: {} });
    expect(spec.outputs).toEqual([]);
    expect(spec.inputs.map((p) => p.name)).toEqual(["url", "body"]);
  });

  it("derives the output port from config.outputKind", () => {
    const spec = runner.resolveSpec({ config: { outputKind: RESPONSE_KIND } });
    expect(spec.outputs).toEqual([
      { name: "out", kind: RESPONSE_KIND, primary: true },
    ]);
  });
});

// --- run ------------------------------------------------------------------

describe("webhook.call — run", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("golden path: dynamic URL from input, POST body, typed JSON output", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(JSON.stringify({ ok: true, id: 7 })));
    vi.stubGlobal("fetch", fetchMock);
    const store = createStubArtifactStore();

    const ctx = buildCtx({
      config: { method: "POST", outputKind: RESPONSE_KIND },
      inputs: [
        markdownInput("url", "https://api.example.com/notify"),
        rawInput("body", '{"hello":"world"}'),
      ],
      store,
    });

    const outcome = await runner.run(ctx);

    expect(outcome.kind).toBe("produced");
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://api.example.com/notify");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"hello":"world"}');

    const recorded = store.last();
    expect(recorded?.kind).toBe(RESPONSE_KIND);
    expect(JSON.parse(recorded!.content)).toEqual({ ok: true, id: 7 });
    expect(recorded?.metadata.source).toBe("webhook.call");
    expect(recorded?.metadata.url).toBe("https://api.example.com/notify");
    expect(recorded?.metadata.method).toBe("POST");
    expect(recorded?.metadata.statusCode).toBe("200");
    expect(recorded?.metadata.latencyMs).toMatch(/^\d+$/);
  });

  it("falls back to config.url when the input is not wired", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(JSON.stringify({ ok: true, id: 1 })));
    vi.stubGlobal("fetch", fetchMock);
    const store = createStubArtifactStore();

    const ctx = buildCtx({
      config: { url: "https://fallback.test/hook", outputKind: RESPONSE_KIND },
      store,
    });
    await runner.run(ctx);
    expect(fetchMock.mock.calls[0][0]).toBe("https://fallback.test/hook");
  });

  it("input URL wins over config.url", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(JSON.stringify({ ok: true, id: 1 })));
    vi.stubGlobal("fetch", fetchMock);
    const store = createStubArtifactStore();

    const ctx = buildCtx({
      config: { url: "https://fallback.test", outputKind: RESPONSE_KIND },
      inputs: [rawInput("url", "https://input.test/win")],
      store,
    });
    await runner.run(ctx);
    expect(fetchMock.mock.calls[0][0]).toBe("https://input.test/win");
  });

  it("throws when neither input nor config provides a URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = buildCtx({
      config: { outputKind: RESPONSE_KIND },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/no URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires config.outputKind", async () => {
    const ctx = buildCtx({
      config: { url: "https://x.test" },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/outputKind/);
  });

  it("fails the step when the JSON does not match the output schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse(JSON.stringify({ ok: "nope" }))),
    );
    const ctx = buildCtx({
      config: { url: "https://x.test", outputKind: RESPONSE_KIND },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toBeInstanceOf(ArtifactSchemaError);
  });

  it("throws a clear error on a non-JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse("<html>nope</html>")),
    );
    const ctx = buildCtx({
      config: { url: "https://x.test", outputKind: RESPONSE_KIND },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/not valid JSON/);
  });

  it("failOnError defaults to true: a 500 fails the step before parsing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse("boom", { ok: false, status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = buildCtx({
      config: { url: "https://x.test", outputKind: RESPONSE_KIND },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/HTTP 500/);
  });

  it("failOnError: false lets a 500 through when the body is valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeResponse(JSON.stringify({ ok: false, id: 9 }), {
          ok: false,
          status: 500,
        }),
      ),
    );
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: {
        url: "https://x.test",
        outputKind: RESPONSE_KIND,
        failOnError: false,
      },
      store,
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced");
    expect(store.last()?.metadata.statusCode).toBe("500");
  });

  it("allowedHosts: a host outside the list is rejected before any fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = buildCtx({
      config: {
        url: "https://evil.test/x",
        outputKind: RESPONSE_KIND,
        allowedHosts: ["api.example.com"],
      },
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrow(/not in allowedHosts/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allowedHosts: an allowed host passes through", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(JSON.stringify({ ok: true, id: 1 })));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = buildCtx({
      config: {
        url: "https://api.example.com/x",
        outputKind: RESPONSE_KIND,
        allowedHosts: ["api.example.com"],
      },
      store: createStubArtifactStore(),
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
