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
import { createBranchMatchRunner } from "./branch-match";

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
        createdAt: "2026-05-12T00:00:00.000Z",
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
  config: Record<string, unknown>;
  inputs: ReadonlyArray<RunContextInput>;
  store: ArtifactStore;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-1"),
  step: {
    id: asStepId("step-1"),
    name: "match",
    kind: "branch.match",
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

const runner = createBranchMatchRunner();
const TARGET = "OneOf<Markdown,LinearRef>";

describe("branch.match — resolveSpec", () => {
  it("declares one sum input and N outputs (one per variant)", () => {
    const spec = runner.resolveSpec({ config: { targetKind: TARGET } });
    expect(spec.inputs).toEqual([
      { name: "in", kinds: [TARGET], primary: true },
    ]);
    expect(spec.outputs.map((o) => ({ name: o.name, kind: o.kind }))).toEqual([
      { name: "out_Markdown", kind: "Markdown" },
      { name: "out_LinearRef", kind: "LinearRef" },
    ]);
  });

  it("throws for missing or non-sum targetKind", () => {
    expect(() => runner.resolveSpec({ config: {} })).toThrow(
      /missing.*targetKind/,
    );
    expect(() =>
      runner.resolveSpec({ config: { targetKind: "Markdown" } }),
    ).toThrow(/not a OneOf/);
  });
});

describe("branch.match — run", () => {
  it("routes the inner payload onto the matching variant port", async () => {
    const store = createStubArtifactStore();
    const sumPayload = {
      variantKind: "Markdown",
      payload: { format: "markdown", body: "hi" },
    };
    const ctx = buildCtx({
      config: { targetKind: TARGET },
      inputs: [
        {
          port: "in",
          kind: TARGET,
          content: JSON.stringify(sumPayload),
          payload: sumPayload,
          artifactId: asArtifactId("artifact-source"),
        },
      ],
      store,
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced-on-port" }
    >;
    expect(outcome.kind).toBe("produced-on-port");
    expect(outcome.port).toBe("out_Markdown");
    expect(outcome.artifact.kind).toBe("Markdown");

    const persisted = store.all();
    expect(persisted).toHaveLength(1);
    expect(JSON.parse(persisted[0].content)).toEqual({
      format: "markdown",
      body: "hi",
    });
  });

  it("dispatches on the other variant when the discriminator changes", async () => {
    const store = createStubArtifactStore();
    const sumPayload = {
      variantKind: "LinearRef",
      payload: { ref: "ABC-12" },
    };
    const ctx = buildCtx({
      config: { targetKind: TARGET },
      inputs: [
        {
          port: "in",
          kind: TARGET,
          content: JSON.stringify(sumPayload),
          payload: sumPayload,
          artifactId: asArtifactId("artifact-source"),
        },
      ],
      store,
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced-on-port" }
    >;
    expect(outcome.port).toBe("out_LinearRef");
    expect(outcome.artifact.kind).toBe("LinearRef");
  });

  it("throws when the observed variantKind is not declared in the sum", async () => {
    const store = createStubArtifactStore();
    const sumPayload = {
      variantKind: "Path",
      payload: { path: "/tmp/x" },
    };
    const ctx = buildCtx({
      config: { targetKind: TARGET },
      inputs: [
        {
          port: "in",
          kind: TARGET,
          content: JSON.stringify(sumPayload),
          payload: sumPayload,
          artifactId: asArtifactId("artifact-source"),
        },
      ],
      store,
    });
    await expect(runner.run(ctx)).rejects.toThrow(/not in declared variants/);
  });

  it("throws when input payload is missing", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { targetKind: TARGET },
      inputs: [],
      store,
    });
    await expect(runner.run(ctx)).rejects.toThrow(/missing artifact/);
  });
});
