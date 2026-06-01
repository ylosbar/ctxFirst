import { describe, expect, it } from "vitest";
import {
  asStepExecId,
  asStepId,
  asWorkflowId,
} from "../domain/ids";
import type { RunContext, RunContextInput } from "../application/step-runner";
import { createFakeArtifactStore } from "../__tests__/fixtures/fake-artifact-store";
import { createFakeLLMGateway } from "../__tests__/fixtures/fake-llm";
import { createFakeRunLog } from "../__tests__/fixtures/fake-run-log";
import { createFakeIdGenerator } from "../__tests__/fixtures/fake-ids";
import { createFakeClock } from "../__tests__/fixtures/fake-clock";
import { createFakeLlmSessionBus } from "../__tests__/fixtures/fake-event-bus";
import { createFakeHash } from "../__tests__/fixtures/fake-hash";
import { createLlmJudgeRunner } from "./llm-judge";

const runner = createLlmJudgeRunner();

type Fakes = {
  store: ReturnType<typeof createFakeArtifactStore>;
  llm: ReturnType<typeof createFakeLLMGateway>;
};

const buildCtx = async (
  fakes: Fakes,
  params: {
    config: Readonly<Record<string, unknown>>;
    subjectBody: string;
    attempt?: number;
  },
): Promise<RunContext> => {
  // Persist the subject so the runner's `artifactStore.get(input.artifactId)`
  // call (the pass-through path) finds the artifact.
  const subject = await fakes.store.put(
    "Markdown",
    JSON.stringify({ format: "markdown", body: params.subjectBody }),
    { payloadFormat: "json-v1" },
  );
  const input: RunContextInput = {
    port: "subject",
    kind: "Markdown",
    content: JSON.stringify({ format: "markdown", body: params.subjectBody }),
    payload: { format: "markdown", body: params.subjectBody },
    artifactId: subject.id,
  };
  return {
    instanceId: asWorkflowId("wf-1"),
    stepExecId: asStepExecId("exec-judge-1"),
    stepId: asStepId("step-judge"),
    step: {
      id: asStepId("step-judge"),
      name: "judge",
      kind: "llm.judge",
      actorRole: "Developer",
      config: params.config,
      humanGateRequired: false,
    },
    inputs: [input],
    loopHistory: [],
    attempt: params.attempt ?? 0,
    workspace: {},
    deps: {
      artifactStore: fakes.store,
      llm: fakes.llm,
      linear: undefined as never,
      shell: undefined as never,
      runLog: createFakeRunLog(),
      clock: createFakeClock(),
      ids: createFakeIdGenerator(),
      llmSession: createFakeLlmSessionBus(),
      logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
      hash: createFakeHash(),
      path: undefined as never,
      environment: undefined as never,
      fs: undefined as never,
    },
  };
};

const makeFakes = (): Fakes => ({
  store: createFakeArtifactStore(),
  llm: createFakeLLMGateway(),
});

describe("llm.judge runner", () => {
  it("routes to `approved` when the verdict is approved (subject pass-through)", async () => {
    const fakes = makeFakes();
    fakes.llm.enqueueText(
      JSON.stringify({ verdict: "approved", summary: "Looks good." }),
    );
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "Approve if > 100 words." },
      subjectBody: "subject content",
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced-on-port");
    if (outcome.kind !== "produced-on-port") return;
    expect(outcome.port).toBe("approved");
    // Pass-through: the artifact emitted is the same Markdown subject (same id).
    expect(outcome.artifact.id).toBe(ctx.inputs[0].artifactId);
  });

  it("routes to `rejected` on rejection when attempts remain (attempt < maxAttempts-1)", async () => {
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

  it("routes to `exhausted` on the last allowed attempt (attempt >= maxAttempts - 1)", async () => {
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
    expect(outcome.kind).toBe("produced-on-port");
    if (outcome.kind !== "produced-on-port") return;
    expect(outcome.port).toBe("exhausted");
  });

  it("uses the default maxAttempts of 3 when unset", async () => {
    const fakes = makeFakes();
    fakes.llm.enqueueText(
      JSON.stringify({ verdict: "rejected", summary: "no good" }),
    );
    const ctx = await buildCtx(fakes, {
      config: { judgePrompt: "Critical." },
      subjectBody: "subject content",
      attempt: 2, // 2 >= 3-1 → exhausted
    });
    const outcome = await runner.run(ctx);
    if (outcome.kind !== "produced-on-port") {
      throw new Error("expected produced-on-port outcome");
    }
    expect(outcome.port).toBe("exhausted");
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

  it("throws when judgePrompt is missing", async () => {
    const fakes = makeFakes();
    const ctx = await buildCtx(fakes, {
      config: {},
      subjectBody: "subject",
    });
    await expect(runner.run(ctx)).rejects.toThrow(/judgePrompt/);
  });
});

describe("llm.judge resolveSpec", () => {
  it("declares three output ports approved/rejected/exhausted", () => {
    const spec = runner.resolveSpec({ config: { judgePrompt: "x" } });
    const names = spec.outputs.map((o) => o.name);
    expect(names).toEqual(["approved", "rejected", "exhausted"]);
  });

  it("uses Markdown for rejected/exhausted regardless of approvedKind", () => {
    const spec = runner.resolveSpec({
      config: { judgePrompt: "x", approvedKind: "TechSpec" },
    });
    const byName = new Map(spec.outputs.map((o) => [o.name, o.kind]));
    expect(byName.get("rejected")).toBe("Markdown");
    expect(byName.get("exhausted")).toBe("Markdown");
    expect(byName.get("approved")).toBe("TechSpec");
  });
});
