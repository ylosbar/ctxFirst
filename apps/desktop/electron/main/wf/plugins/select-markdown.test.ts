import { describe, expect, it } from "vitest";
import {
  asArtifactHash,
  asArtifactId,
  asStepExecId,
  asStepId,
  asWorkflowId,
} from "../domain/ids";
import type { Artifact } from "../domain/artifact";
import type { ArtifactStore } from "../application/ports/outbound/artifact-store";
import type {
  RunContext,
  RunContextInput,
  StepOutcome,
} from "../application/step-runner";
import { createSelectMarkdownRunner } from "./select-markdown";

/**
 * Stub store that captures the content of the last `put` so a test can read
 * back the produced Markdown body. `get`/`getByHash` are unused by this runner
 * (it always writes a fresh artifact) but kept to satisfy the port.
 */
type StubStore = ArtifactStore & { lastContent: () => string };

const createStubArtifactStore = (): StubStore => {
  let counter = 0;
  let last = "";
  return {
    async put(kind, content, metadata = {}): Promise<Artifact> {
      counter += 1;
      last = content;
      return {
        id: asArtifactId(`artifact-${counter}`),
        kind,
        hash: asArtifactHash(`hash-${counter}`),
        storageRef: "stub",
        metadata,
        createdAt: "2026-05-14T00:00:00.000Z",
      };
    },
    async get(id) {
      return {
        meta: {
          id,
          kind: "Markdown",
          hash: asArtifactHash("hash-upstream"),
          storageRef: "stub",
          metadata: {},
          createdAt: "2026-05-14T00:00:00.000Z",
        },
        content: "",
      };
    },
    async getByHash() {
      return null;
    },
    lastContent: () => last,
  };
};

const buildCtx = (params: {
  config: Readonly<Record<string, unknown>>;
  inputs: ReadonlyArray<RunContextInput>;
  store: ArtifactStore;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-select"),
  step: {
    id: asStepId("step-select"),
    name: "select",
    kind: "select.markdown",
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

const condInput = (body: string): RunContextInput => ({
  port: "cond",
  kind: "Json",
  content: JSON.stringify({ format: "json", body }),
  payload: { format: "json", body },
  artifactId: asArtifactId("cond-1"),
});

const valueInput = (body: string): RunContextInput => ({
  port: "value",
  kind: "Markdown",
  content: JSON.stringify({ format: "markdown", body }),
  payload: { format: "markdown", body },
  artifactId: asArtifactId("value-1"),
});

const runner = createSelectMarkdownRunner();

/** Runs the runner and returns the produced Markdown body. */
const runBody = async (
  config: Readonly<Record<string, unknown>>,
  inputs: ReadonlyArray<RunContextInput>,
): Promise<string> => {
  const store = createStubArtifactStore();
  const ctx = buildCtx({ config, inputs, store });
  const outcome = (await runner.run(ctx)) as Extract<
    StepOutcome,
    { kind: "produced" }
  >;
  expect(outcome.kind).toBe("produced");
  return (JSON.parse(store.lastContent()) as { body: string }).body;
};

describe("select.markdown — resolveSpec", () => {
  it("declares cond (primary, *), optional value, and a single Markdown out", () => {
    const spec = runner.resolveSpec({ config: { path: "$.flag" } });
    expect(spec.inputs).toHaveLength(2);
    expect(spec.inputs[0]).toMatchObject({ name: "cond", kinds: ["*"], primary: true });
    expect(spec.inputs[1]).toMatchObject({ name: "value", optional: true });
    expect(spec.outputs).toHaveLength(1);
    expect(spec.outputs[0]).toMatchObject({ name: "out", kind: "Markdown", primary: true });
  });

  it("throws when path is missing", () => {
    expect(() => runner.resolveSpec({ config: {} })).toThrowError(
      /requires `config.path/,
    );
  });

  it("throws when path is empty", () => {
    expect(() => runner.resolveSpec({ config: { path: "" } })).toThrowError(
      /requires `config.path/,
    );
  });
});

describe("select.markdown — run injection", () => {
  it("injects the value body when the flag is true", async () => {
    expect(
      await runBody({ path: "$.flag" }, [
        condInput('{"flag":true}'),
        valueInput("# Design System"),
      ]),
    ).toBe("# Design System");
  });

  it("emits empty Markdown when the flag is false", async () => {
    expect(
      await runBody({ path: "$.flag" }, [
        condInput('{"flag":false}'),
        valueInput("# Design System"),
      ]),
    ).toBe("");
  });

  it("emits empty Markdown when the flag is true but value is not wired", async () => {
    expect(
      await runBody({ path: "$.flag" }, [condInput('{"flag":true}')]),
    ).toBe("");
  });

  it("always produces on `out` (never produced-on-port)", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { path: "$.flag" },
      inputs: [condInput('{"flag":false}')],
      store,
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced");
  });

  it("tags the produced artifact with the injected flag", async () => {
    const store = createStubArtifactStore();
    let captured: Record<string, string> = {};
    const spy: ArtifactStore = {
      ...store,
      async put(kind, content, metadata = {}) {
        captured = metadata;
        return store.put(kind, content, metadata);
      },
    };
    const ctx = buildCtx({
      config: { path: "$.flag" },
      inputs: [condInput('{"flag":true}'), valueInput("x")],
      store: spy,
    });
    await runner.run(ctx);
    expect(captured).toMatchObject({ source: "select.markdown", injected: "true" });
  });
});

describe("select.markdown — truthiness table", () => {
  const cases: ReadonlyArray<[string, boolean]> = [
    ['{"flag":true}', true],
    ['{"flag":false}', false],
    ['{"flag":"true"}', true],
    ['{"flag":"false"}', false],
    ['{"flag":null}', false],
    ['{"flag":0}', false],
    ['{"flag":1}', true],
    ['{"flag":""}', false],
    ['{"flag":"x"}', true],
  ];

  for (const [cond, truthy] of cases) {
    it(`${cond} → ${truthy ? "injected" : "empty"}`, async () => {
      const body = await runBody({ path: "$.flag" }, [
        condInput(cond),
        valueInput("FRAGMENT"),
      ]);
      expect(body).toBe(truthy ? "FRAGMENT" : "");
    });
  }
});

describe("select.markdown — run errors", () => {
  it("strips a Markdown code fence (shell.exec stdout) before parsing", async () => {
    expect(
      await runBody({ path: "$.flag" }, [
        condInput('```json\n{"flag":true}\n```'),
        valueInput("FRAGMENT"),
      ]),
    ).toBe("FRAGMENT");
  });

  it("throws when the cond port is missing", async () => {
    const ctx = buildCtx({
      config: { path: "$.flag" },
      inputs: [],
      store: createStubArtifactStore(),
    });
    await expect(runner.run(ctx)).rejects.toThrowError(/missing artifact/);
  });

  it("throws when cond is not valid JSON", async () => {
    await expect(
      runBody({ path: "$.flag" }, [condInput("not json")]),
    ).rejects.toThrowError(/not valid JSON/);
  });

  it("throws when the path matches nothing", async () => {
    await expect(
      runBody({ path: "$.flag" }, [condInput('{"other":true}')]),
    ).rejects.toThrowError(/matched 0 values/);
  });

  it("throws when the path matches more than one value", async () => {
    await expect(
      runBody({ path: "$.items[*].flag" }, [
        condInput('{"items":[{"flag":true},{"flag":false}]}'),
      ]),
    ).rejects.toThrowError(/matched 2 values \(expected exactly 1\)/);
  });

  it("throws when the matched value is non-scalar", async () => {
    await expect(
      runBody({ path: "$.flag" }, [condInput('{"flag":{"nested":true}}')]),
    ).rejects.toThrowError(/matched a non-scalar value/);
  });
});
