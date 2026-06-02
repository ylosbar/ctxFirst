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
import { createBranchJsonRunner } from "./branch-json";

/**
 * Stub store whose `get` round-trips the upstream artifact's meta — that's the
 * passthrough path `branch.json` relies on (re-emit input unchanged on the
 * chosen port). `put` is unused by this runner but kept to satisfy the port.
 */
const createStubArtifactStore = (): ArtifactStore => {
  let counter = 0;
  return {
    async put(kind, _content, metadata = {}): Promise<Artifact> {
      counter += 1;
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
          kind: "Json",
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
  };
};

const buildCtx = (params: {
  config: Readonly<Record<string, unknown>>;
  inputs: ReadonlyArray<RunContextInput>;
  store: ArtifactStore;
}): RunContext => ({
  instanceId: asWorkflowId("wf-1"),
  stepExecId: asStepExecId("exec-1"),
  stepId: asStepId("step-branch"),
  step: {
    id: asStepId("step-branch"),
    name: "branch",
    kind: "branch.json",
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

const jsonInput = (
  body: string,
  artifactId = "upstream-1",
): RunContextInput => ({
  port: "json",
  kind: "Json",
  content: JSON.stringify({ format: "json", body }),
  payload: { format: "json", body },
  artifactId: asArtifactId(artifactId),
});

const runner = createBranchJsonRunner();

const runChosen = async (
  config: Readonly<Record<string, unknown>>,
  input: RunContextInput,
): Promise<string> => {
  const ctx = buildCtx({ config, inputs: [input], store: createStubArtifactStore() });
  const outcome = (await runner.run(ctx)) as Extract<
    StepOutcome,
    { kind: "produced-on-port" }
  >;
  expect(outcome.kind).toBe("produced-on-port");
  return outcome.port;
};

describe("branch.json — resolveSpec", () => {
  it("declares one passthrough output port per case (default Json)", () => {
    const spec = runner.resolveSpec({
      config: { path: "$.flag", cases: ["true", "false"] },
    });
    expect(spec.inputs[0]).toMatchObject({ name: "json", kinds: ["*"] });
    expect(spec.outputs).toHaveLength(2);
    expect(spec.outputs[0]).toMatchObject({ name: "true", kind: "Json" });
    expect(spec.outputs[1]).toMatchObject({ name: "false", kind: "Json" });
  });

  it("honors a custom inputKind for the passthrough ports", () => {
    const spec = runner.resolveSpec({
      config: { path: "$.flag", cases: ["a", "b"], inputKind: "Markdown" },
    });
    expect(spec.outputs[0].kind).toBe("Markdown");
  });

  it("throws when path is missing", () => {
    expect(() =>
      runner.resolveSpec({ config: { cases: ["true", "false"] } }),
    ).toThrowError(/requires `config.path/);
  });

  it("throws when cases has fewer than 2 entries", () => {
    expect(() =>
      runner.resolveSpec({ config: { path: "$.flag", cases: ["only"] } }),
    ).toThrowError(/at least 2 entries/);
  });

  it("throws on a port-unsafe case label", () => {
    expect(() =>
      runner.resolveSpec({ config: { path: "$.flag", cases: ["ok", "no good"] } }),
    ).toThrowError(/must match/);
  });
});

describe("branch.json — run routing", () => {
  it("routes a boolean true to the \"true\" port", async () => {
    expect(
      await runChosen(
        { path: "$.besoin_design_system", cases: ["true", "false"] },
        jsonInput('{"besoin_design_system":true}'),
      ),
    ).toBe("true");
  });

  it("routes a boolean false to the \"false\" port", async () => {
    expect(
      await runChosen(
        { path: "$.besoin_design_system", cases: ["true", "false"] },
        jsonInput('{"besoin_design_system":false}'),
      ),
    ).toBe("false");
  });

  it("coerces a number scalar to a port-safe string verdict", async () => {
    expect(
      await runChosen(
        { path: "$.code", cases: ["c200", "c404"] },
        jsonInput('{"code":200}'),
      ).catch((e: Error) => e.message),
      // Number 200 coerces to the verdict string "200" — proven by the
      // no-match error surfacing it (digit-leading labels aren't port-safe, so
      // a number can only route via a label authored to match its string form).
    ).toMatch(/value "200" does not match any case/);
  });

  it("routes a string scalar verbatim", async () => {
    expect(
      await runChosen(
        { path: "$.env", cases: ["prod", "dev"] },
        jsonInput('{"env":"prod"}'),
      ),
    ).toBe("prod");
  });

  it("coerces null to \"null\"", async () => {
    expect(
      await runChosen(
        { path: "$.value", cases: ["null", "set"] },
        jsonInput('{"value":null}'),
      ),
    ).toBe("null");
  });

  it("strips a Markdown code fence (shell.exec stdout) before parsing", async () => {
    expect(
      await runChosen(
        { path: "$.flag", cases: ["true", "false"] },
        jsonInput('```json\n{"flag":true}\n```'),
      ),
    ).toBe("true");
  });

  it("passes the input artifact through unchanged on the chosen port", async () => {
    const store = createStubArtifactStore();
    const ctx = buildCtx({
      config: { path: "$.flag", cases: ["true", "false"] },
      inputs: [jsonInput('{"flag":true}', "upstream-42")],
      store,
    });
    const outcome = (await runner.run(ctx)) as Extract<
      StepOutcome,
      { kind: "produced-on-port" }
    >;
    expect(outcome.port).toBe("true");
    expect(outcome.artifact.id).toBe(asArtifactId("upstream-42"));
  });
});

describe("branch.json — run errors", () => {
  const cfg = { path: "$.flag", cases: ["true", "false"] };

  it("throws when the input port is missing", async () => {
    const ctx = buildCtx({ config: cfg, inputs: [], store: createStubArtifactStore() });
    await expect(runner.run(ctx)).rejects.toThrowError(/missing artifact/);
  });

  it("throws when the input is not valid JSON", async () => {
    await expect(
      runChosen(cfg, jsonInput("not json at all")),
    ).rejects.toThrowError(/input is not valid JSON/);
  });

  it("throws when the path matches nothing", async () => {
    await expect(
      runChosen(cfg, jsonInput('{"other":true}')),
    ).rejects.toThrowError(/matched nothing/);
  });

  it("throws when the path matches more than one value", async () => {
    await expect(
      runChosen(
        { path: "$.items[*].flag", cases: ["true", "false"] },
        jsonInput('{"items":[{"flag":true},{"flag":false}]}'),
      ),
    ).rejects.toThrowError(/matched 2 values \(expected exactly 1\)/);
  });

  it("throws when the matched value is non-scalar", async () => {
    await expect(
      runChosen(
        { path: "$.flag", cases: ["true", "false"] },
        jsonInput('{"flag":{"nested":true}}'),
      ),
    ).rejects.toThrowError(/matched a non-scalar value/);
  });

  it("throws when the verdict matches no declared case", async () => {
    await expect(
      runChosen(cfg, jsonInput('{"flag":"maybe"}')),
    ).rejects.toThrowError(/does not match any case/);
  });
});
