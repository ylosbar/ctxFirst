import { describe, expect, it } from "vitest";
import { asStepExecId, asStepId, asWorkflowId } from "../domain/ids";
import type { RunContext, RunContextInput } from "../application/step-runner";
import { createFakeArtifactStore } from "../__tests__/fixtures/fake-artifact-store";
import { createFakeLLMGateway } from "../__tests__/fixtures/fake-llm";
import { createFakeRunLog } from "../__tests__/fixtures/fake-run-log";
import { createFakeIdGenerator } from "../__tests__/fixtures/fake-ids";
import { createFakeClock } from "../__tests__/fixtures/fake-clock";
import { createFakeLlmSessionBus } from "../__tests__/fixtures/fake-event-bus";
import { createFakeHash } from "../__tests__/fixtures/fake-hash";
import { createAgentInvokeRunner, type AgentBackends } from "./agent-invoke";

type Fakes = {
  store: ReturnType<typeof createFakeArtifactStore>;
  claude: ReturnType<typeof createFakeLLMGateway>;
  codex: ReturnType<typeof createFakeLLMGateway>;
  backends: AgentBackends;
};

const makeFakes = (): Fakes => {
  const claude = createFakeLLMGateway();
  const codex = createFakeLLMGateway();
  return {
    store: createFakeArtifactStore(),
    claude,
    codex,
    backends: { "claude-code": claude, codex },
  };
};

const promptInput = async (
  store: Fakes["store"],
  body: string,
): Promise<RunContextInput> => {
  const content = JSON.stringify({ format: "markdown", body });
  const stored = await store.put("Markdown", content, { payloadFormat: "json-v1" });
  return {
    port: "prompt",
    kind: "Markdown",
    content,
    payload: { format: "markdown", body },
    artifactId: stored.id,
  };
};

const buildCtx = async (
  fakes: Fakes,
  params: {
    config: Readonly<Record<string, unknown>>;
    prompt?: string;
    humanGateRequired?: boolean;
    withInput?: boolean;
  },
): Promise<RunContext> => {
  const inputs: RunContextInput[] =
    params.withInput === false
      ? []
      : [await promptInput(fakes.store, params.prompt ?? "do the thing")];
  return {
    instanceId: asWorkflowId("wf-1"),
    stepExecId: asStepExecId("exec-agent-1"),
    stepId: asStepId("step-agent"),
    step: {
      id: asStepId("step-agent"),
      name: "agent",
      kind: "agent.invoke",
      actorRole: "LLMAgent",
      config: params.config,
      humanGateRequired: params.humanGateRequired ?? false,
    },
    inputs,
    loopHistory: [],
    attempt: 0,
    workspace: { cwd: "/tmp/ws" },
    deps: {
      artifactStore: fakes.store,
      llm: undefined as never,
      linear: undefined as never,
      shell: undefined as never,
      runLog: createFakeRunLog(),
      clock: createFakeClock(),
      ids: createFakeIdGenerator(),
      llmSession: createFakeLlmSessionBus(),
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      hash: createFakeHash(),
      path: undefined as never,
      environment: undefined as never,
      fs: undefined as never,
    },
  };
};

describe("agent.invoke runner", () => {
  it("routes provider `claude-code` to the claude-code gateway (not codex)", async () => {
    const fakes = makeFakes();
    fakes.claude.enqueueResponse({ output: "hello", provider: "claude-code" });
    const ctx = await buildCtx(fakes, {
      config: { provider: "claude-code", model: "claude-opus-4-7", outputKind: "Markdown" },
    });
    await createAgentInvokeRunner({ backends: fakes.backends }).run(ctx);
    expect(fakes.claude.invocations).toHaveLength(1);
    expect(fakes.codex.invocations).toHaveLength(0);
    expect(fakes.claude.invocations[0].model).toBe("claude-opus-4-7");
    expect(fakes.claude.invocations[0].cwd).toBe("/tmp/ws");
  });

  it("routes provider `codex` to the codex gateway (not claude-code)", async () => {
    const fakes = makeFakes();
    fakes.codex.enqueueResponse({ output: "hi", provider: "codex-cli" });
    const ctx = await buildCtx(fakes, {
      config: { provider: "codex", model: "gpt-5-codex", outputKind: "Markdown" },
    });
    await createAgentInvokeRunner({ backends: fakes.backends }).run(ctx);
    expect(fakes.codex.invocations).toHaveLength(1);
    expect(fakes.claude.invocations).toHaveLength(0);
  });

  it("defaults to claude-code when provider is absent", async () => {
    const fakes = makeFakes();
    fakes.claude.enqueueResponse({ output: "x", provider: "claude-code" });
    const ctx = await buildCtx(fakes, {
      config: { outputKind: "Markdown" },
    });
    await createAgentInvokeRunner({ backends: fakes.backends }).run(ctx);
    expect(fakes.claude.invocations).toHaveLength(1);
    expect(fakes.codex.invocations).toHaveLength(0);
  });

  it("falls back to defaultModelFor(provider) when model is absent", async () => {
    const fakes = makeFakes();
    fakes.codex.enqueueResponse({ output: "x", provider: "codex-cli" });
    const ctx = await buildCtx(fakes, {
      config: { provider: "codex", outputKind: "Markdown" },
    });
    await createAgentInvokeRunner({ backends: fakes.backends }).run(ctx);
    expect(fakes.codex.invocations[0].model).toBe("gpt-5-codex");
  });

  it("throws with the provider list on an unknown provider", async () => {
    const fakes = makeFakes();
    const ctx = await buildCtx(fakes, {
      config: { provider: "gpt-4", outputKind: "Markdown" },
    });
    await expect(
      createAgentInvokeRunner({ backends: fakes.backends }).run(ctx),
    ).rejects.toThrow(/unknown provider "gpt-4".*claude-code, codex/);
  });

  it("throws when a known provider is not wired", async () => {
    const fakes = makeFakes();
    // Registry knows `codex` but the wired map only has claude-code.
    const backends: AgentBackends = { "claude-code": fakes.claude };
    const ctx = await buildCtx(fakes, {
      config: { provider: "codex", outputKind: "Markdown" },
    });
    await expect(
      createAgentInvokeRunner({ backends }).run(ctx),
    ).rejects.toThrow(/not wired/);
  });

  it("stamps the reported provider (res.provider) on the artifact + run-log, not config.provider", async () => {
    const fakes = makeFakes();
    fakes.codex.enqueueResponse({ output: "out", provider: "codex-cli" });
    const runLog = createFakeRunLog();
    const ctx = await buildCtx(fakes, {
      config: { provider: "codex", outputKind: "Markdown" },
    });
    ctx.deps.runLog = runLog;
    const outcome = await createAgentInvokeRunner({ backends: fakes.backends }).run(ctx);
    if (outcome.kind !== "produced") throw new Error("expected produced");
    // config.provider === "codex" but the adapter reports "codex-cli".
    expect(outcome.artifact.metadata.provider).toBe("codex-cli");
    expect(runLog.records[0].provider).toBe("codex-cli");
  });

  it("returns produced-pending-human with actorRole when humanGateRequired", async () => {
    const fakes = makeFakes();
    fakes.claude.enqueueResponse({ output: "x", provider: "claude-code" });
    const ctx = await buildCtx(fakes, {
      config: { provider: "claude-code", outputKind: "Markdown", actorRole: "PO" },
      humanGateRequired: true,
    });
    const outcome = await createAgentInvokeRunner({ backends: fakes.backends }).run(ctx);
    expect(outcome.kind).toBe("produced-pending-human");
    if (outcome.kind !== "produced-pending-human") return;
    expect(outcome.actorRole).toBe("PO");
  });

  it("throws when the prompt input is missing", async () => {
    const fakes = makeFakes();
    const ctx = await buildCtx(fakes, {
      config: { provider: "claude-code", outputKind: "Markdown" },
      withInput: false,
    });
    await expect(
      createAgentInvokeRunner({ backends: fakes.backends }).run(ctx),
    ).rejects.toThrow(/'prompt' input/);
  });
});

describe("agent.invoke resolveSpec", () => {
  it("exposes a wildcard prompt input and a polymorphic out port", () => {
    const runner = createAgentInvokeRunner({ backends: {} });
    const spec = runner.resolveSpec({ config: { outputKind: "Json" } });
    expect(spec.inputs.map((i) => i.name)).toEqual(["prompt"]);
    expect(spec.outputs[0]).toMatchObject({ name: "out", kind: "Json" });
  });

  it("throws when outputKind is missing", () => {
    const runner = createAgentInvokeRunner({ backends: {} });
    expect(() => runner.resolveSpec({ config: {} })).toThrow(/outputKind/);
  });
});
