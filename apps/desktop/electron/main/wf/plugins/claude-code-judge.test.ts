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
import { createClaudeCodeJudgeRunner } from "./claude-code-judge";

const runner = createClaudeCodeJudgeRunner();

type Fakes = {
  store: ReturnType<typeof createFakeArtifactStore>;
  llm: ReturnType<typeof createFakeLLMGateway>;
};

const makeFakes = (): Fakes => ({
  store: createFakeArtifactStore(),
  llm: createFakeLLMGateway(),
});

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
      kind: "claude_code.judge",
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
      llm: fakes.llm,
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

describe("claude_code.judge runner", () => {
  it("routes to `approved` (subject pass-through) and passes criteria as the system prompt", async () => {
    const fakes = makeFakes();
    fakes.llm.enqueueText(
      JSON.stringify({ verdict: "approved", summary: "Conforme à la spec." }),
    );
    const ctx = await buildCtx(fakes, {
      config: {},
      subjectBody: "subject content",
      criteriaBody: "## Spec\nApprouve si la sortie respecte la spec.",
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced-on-port");
    if (outcome.kind !== "produced-on-port") return;
    expect(outcome.port).toBe("approved");
    // Pass-through: the artifact emitted is the same Markdown subject (same id).
    expect(outcome.artifact.id).toBe(ctx.inputs[0].artifactId);
    // The wired `criteria` input drives the system prompt; the workspace cwd
    // is forwarded so the judge runs as an agent in the run's directory.
    const req = fakes.llm.invocations[0];
    expect(req.systemPrompt).toContain("Approuve si la sortie respecte la spec");
    expect(req.userPrompt).toContain("subject content");
    expect(req.cwd).toBe("/tmp/ws");
  });

  it("falls back to config.judgePrompt when no `criteria` input is wired", async () => {
    const fakes = makeFakes();
    fakes.llm.enqueueText(JSON.stringify({ verdict: "approved", summary: "ok" }));
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "Approve if > 100 words." },
      subjectBody: "subject content",
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced-on-port");
    if (outcome.kind !== "produced-on-port") return;
    expect(outcome.port).toBe("approved");
    expect(fakes.llm.invocations[0].systemPrompt).toContain("Approve if > 100 words.");
  });

  it("prefers the wired `criteria` input over config.judgePrompt", async () => {
    const fakes = makeFakes();
    fakes.llm.enqueueText(JSON.stringify({ verdict: "approved", summary: "ok" }));
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "INLINE CRITERIA" },
      subjectBody: "subject content",
      criteriaBody: "WIRED CRITERIA",
    });
    await runner.run(ctx);
    const sys = fakes.llm.invocations[0].systemPrompt;
    expect(sys).toContain("WIRED CRITERIA");
    expect(sys).not.toContain("INLINE CRITERIA");
  });

  it("routes to `rejected` on rejection when attempts remain", async () => {
    const fakes = makeFakes();
    fakes.llm.enqueueText(
      JSON.stringify({
        verdict: "rejected",
        summary: "Missing tests",
        comments: [{ anchor: { startLine: 5, endLine: 7 }, body: "no edge case" }],
      }),
    );
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "Reject if no tests.", maxAttempts: 3 },
      subjectBody: "subject content",
      attempt: 0,
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced-on-port");
    if (outcome.kind !== "produced-on-port") return;
    expect(outcome.port).toBe("rejected");
    // A new Markdown feedback artifact (not the subject).
    expect(outcome.artifact.kind).toBe("Markdown");
    expect(outcome.artifact.id).not.toBe(ctx.inputs[0].artifactId);
  });

  it("routes to `exhausted` on the last allowed attempt", async () => {
    const fakes = makeFakes();
    fakes.llm.enqueueText(
      JSON.stringify({ verdict: "rejected", summary: "Still wrong" }),
    );
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "Strict.", maxAttempts: 3 },
      subjectBody: "subject content",
      attempt: 2,
    });
    const outcome = await runner.run(ctx);
    if (outcome.kind !== "produced-on-port") {
      throw new Error("expected produced-on-port outcome");
    }
    expect(outcome.port).toBe("exhausted");
  });

  it("throws when no criteria is provided (neither input nor config)", async () => {
    const fakes = makeFakes();
    // No response needed — it must throw before invoking the LLM.
    const ctx = await buildCtx(fakes, {
      config: {},
      subjectBody: "subject content",
    });
    await expect(runner.run(ctx)).rejects.toThrow(/criteria/);
  });

  it("throws when the LLM returns invalid JSON", async () => {
    const fakes = makeFakes();
    fakes.llm.enqueueText("not json at all");
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "x" },
      subjectBody: "subject",
    });
    await expect(runner.run(ctx)).rejects.toThrow(/not valid JSON/);
  });
});

describe("claude_code.judge resolveSpec", () => {
  it("declares subject + optional criteria inputs and three output ports", () => {
    const spec = runner.resolveSpec({ config: {} });
    expect(spec.inputs.map((i) => i.name)).toEqual(["subject", "criteria"]);
    expect(spec.inputs.find((i) => i.name === "criteria")?.optional).toBe(true);
    expect(spec.outputs.map((o) => o.name)).toEqual([
      "approved",
      "rejected",
      "exhausted",
    ]);
  });

  it("uses Markdown for rejected/exhausted regardless of approvedKind", () => {
    const spec = runner.resolveSpec({ config: { approvedKind: "TechSpec" } });
    const byName = new Map(spec.outputs.map((o) => [o.name, o.kind]));
    expect(byName.get("rejected")).toBe("Markdown");
    expect(byName.get("exhausted")).toBe("Markdown");
    expect(byName.get("approved")).toBe("TechSpec");
  });
});
