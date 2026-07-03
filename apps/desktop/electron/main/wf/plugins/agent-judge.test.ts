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
import type { AgentBackends } from "./agent-invoke";
import { createAgentJudgeRunner as makeRunner } from "./agent-judge";

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

const markdownInput = async (
  store: Fakes["store"],
  port: string,
  body: string,
): Promise<RunContextInput> => {
  const content = JSON.stringify({ format: "markdown", body });
  const stored = await store.put("Markdown", content, { payloadFormat: "json-v1" });
  return {
    port,
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
    subjectBody: string;
    criteriaBody?: string;
    attempt?: number;
  },
): Promise<RunContext> => {
  const inputs: RunContextInput[] = [
    await markdownInput(fakes.store, "subject", params.subjectBody),
  ];
  if (params.criteriaBody !== undefined) {
    inputs.push(await markdownInput(fakes.store, "criteria", params.criteriaBody));
  }
  return {
    instanceId: asWorkflowId("wf-1"),
    stepExecId: asStepExecId("exec-judge-1"),
    stepId: asStepId("step-judge"),
    step: {
      id: asStepId("step-judge"),
      name: "judge",
      kind: "agent.judge",
      actorRole: "LLMAgent",
      config: params.config,
      humanGateRequired: false,
    },
    inputs,
    loopHistory: [],
    attempt: params.attempt ?? 0,
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

describe("agent.judge runner — provider selection", () => {
  it("routes provider `claude-code` to the claude-code gateway", async () => {
    const fakes = makeFakes();
    fakes.claude.enqueueText(JSON.stringify({ verdict: "approved", summary: "ok" }));
    const ctx = await buildCtx(fakes, {
      config: { provider: "claude-code", judgePrompt: "Spec." },
      subjectBody: "subject",
    });
    await makeRunner({ backends: fakes.backends }).run(ctx);
    expect(fakes.claude.invocations).toHaveLength(1);
    expect(fakes.codex.invocations).toHaveLength(0);
    // criteria is passed as the system prompt.
    expect(fakes.claude.invocations[0].systemPrompt).toContain("Spec.");
  });

  it("routes provider `codex` to the codex gateway", async () => {
    const fakes = makeFakes();
    fakes.codex.enqueueText(JSON.stringify({ verdict: "approved", summary: "ok" }));
    const ctx = await buildCtx(fakes, {
      config: { provider: "codex", judgePrompt: "Spec." },
      subjectBody: "subject",
    });
    await makeRunner({ backends: fakes.backends }).run(ctx);
    expect(fakes.codex.invocations).toHaveLength(1);
    expect(fakes.claude.invocations).toHaveLength(0);
  });

  it("defaults to claude-code when provider is absent", async () => {
    const fakes = makeFakes();
    fakes.claude.enqueueText(JSON.stringify({ verdict: "approved", summary: "ok" }));
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "Spec." },
      subjectBody: "subject",
    });
    await makeRunner({ backends: fakes.backends }).run(ctx);
    expect(fakes.claude.invocations).toHaveLength(1);
  });

  it("falls back to defaultModelFor(provider) when model is absent", async () => {
    const fakes = makeFakes();
    fakes.codex.enqueueText(JSON.stringify({ verdict: "approved", summary: "ok" }));
    const ctx = await buildCtx(fakes, {
      config: { provider: "codex", judgePrompt: "Spec." },
      subjectBody: "subject",
    });
    await makeRunner({ backends: fakes.backends }).run(ctx);
    expect(fakes.codex.invocations[0].model).toBe("gpt-5-codex");
  });

  it("throws with the provider list on an unknown provider", async () => {
    const fakes = makeFakes();
    const ctx = await buildCtx(fakes, {
      config: { provider: "gpt-4", judgePrompt: "x" },
      subjectBody: "subject",
    });
    await expect(
      makeRunner({ backends: fakes.backends }).run(ctx),
    ).rejects.toThrow(/unknown provider "gpt-4".*claude-code, codex/);
  });

  it("throws when a known provider is not wired", async () => {
    const fakes = makeFakes();
    const backends: AgentBackends = { "claude-code": fakes.claude };
    const ctx = await buildCtx(fakes, {
      config: { provider: "codex", judgePrompt: "x" },
      subjectBody: "subject",
    });
    await expect(makeRunner({ backends }).run(ctx)).rejects.toThrow(/not wired/);
  });
});

describe("agent.judge runner — contract parity with claude_code.judge", () => {
  it("routes to `approved` (subject pass-through)", async () => {
    const fakes = makeFakes();
    fakes.claude.enqueueText(
      JSON.stringify({ verdict: "approved", summary: "Conforme." }),
    );
    const ctx = await buildCtx(fakes, {
      config: {},
      subjectBody: "subject content",
      criteriaBody: "## Spec\nApprouve si conforme.",
    });
    const outcome = await makeRunner({ backends: fakes.backends }).run(ctx);
    expect(outcome.kind).toBe("produced-on-port");
    if (outcome.kind !== "produced-on-port") return;
    expect(outcome.port).toBe("approved");
    expect(outcome.artifact.id).toBe(ctx.inputs[0].artifactId);
  });

  it("prefers the wired `criteria` input over config.judgePrompt", async () => {
    const fakes = makeFakes();
    fakes.claude.enqueueText(JSON.stringify({ verdict: "approved", summary: "ok" }));
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "INLINE CRITERIA" },
      subjectBody: "subject content",
      criteriaBody: "WIRED CRITERIA",
    });
    await makeRunner({ backends: fakes.backends }).run(ctx);
    const sys = fakes.claude.invocations[0].systemPrompt;
    expect(sys).toContain("WIRED CRITERIA");
    expect(sys).not.toContain("INLINE CRITERIA");
  });

  it("routes to `rejected` when attempts remain", async () => {
    const fakes = makeFakes();
    fakes.claude.enqueueText(
      JSON.stringify({ verdict: "rejected", summary: "Missing tests" }),
    );
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "Reject if no tests.", maxAttempts: 3 },
      subjectBody: "subject content",
      attempt: 0,
    });
    const outcome = await makeRunner({ backends: fakes.backends }).run(ctx);
    if (outcome.kind !== "produced-on-port") throw new Error("expected produced-on-port");
    expect(outcome.port).toBe("rejected");
    expect(outcome.artifact.kind).toBe("Markdown");
    expect(outcome.artifact.id).not.toBe(ctx.inputs[0].artifactId);
  });

  it("routes to `exhausted` on the last allowed attempt", async () => {
    const fakes = makeFakes();
    fakes.claude.enqueueText(
      JSON.stringify({ verdict: "rejected", summary: "Still wrong" }),
    );
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "Strict.", maxAttempts: 3 },
      subjectBody: "subject content",
      attempt: 2,
    });
    const outcome = await makeRunner({ backends: fakes.backends }).run(ctx);
    if (outcome.kind !== "produced-on-port") throw new Error("expected produced-on-port");
    expect(outcome.port).toBe("exhausted");
  });

  it("throws when no criteria is provided (neither input nor config)", async () => {
    const fakes = makeFakes();
    const ctx = await buildCtx(fakes, { config: {}, subjectBody: "subject content" });
    await expect(
      makeRunner({ backends: fakes.backends }).run(ctx),
    ).rejects.toThrow(/criteria/);
  });
});

describe("agent.judge resolveSpec", () => {
  it("declares subject + optional criteria inputs and three output ports", () => {
    const spec = makeRunner({ backends: {} }).resolveSpec({ config: {} });
    expect(spec.inputs.map((i) => i.name)).toEqual(["subject", "criteria"]);
    expect(spec.inputs.find((i) => i.name === "criteria")?.optional).toBe(true);
    expect(spec.outputs.map((o) => o.name)).toEqual([
      "approved",
      "rejected",
      "exhausted",
    ]);
  });
});
