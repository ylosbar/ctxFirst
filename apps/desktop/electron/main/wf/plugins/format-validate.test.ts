import { describe, expect, it } from "vitest";
import {
  asStepExecId,
  asStepId,
  asWorkflowId,
} from "../domain/ids";
import type { ArtifactKind } from "../domain/artifact";
import {
  ArtifactSchemaError,
  UnknownArtifactKindError,
} from "../domain/artifact-errors";
import type { ArtifactSchemaRegistry } from "../application/ports/outbound/artifact-schema-registry";
import type { RunContext, RunContextInput } from "../application/step-runner";
import { parseJudgeFeedback } from "../domain/judge-feedback";
import { createFakeArtifactStore } from "../__tests__/fixtures/fake-artifact-store";
import { createFakeRunLog } from "../__tests__/fixtures/fake-run-log";
import { createFakeIdGenerator } from "../__tests__/fixtures/fake-ids";
import { createFakeClock } from "../__tests__/fixtures/fake-clock";
import { createFakeLlmSessionBus } from "../__tests__/fixtures/fake-event-bus";
import { createFakeHash } from "../__tests__/fixtures/fake-hash";
import { createFormatValidateRunner } from "./format-validate";

const runner = createFormatValidateRunner();

type ValidateResult = ReturnType<ArtifactSchemaRegistry["validate"]>;

/**
 * Minimal `ArtifactSchemaRegistry` exposing only `validate` — the single method
 * the runner touches. Returns a canned result so each test pins the exact
 * branch (ok / schema error / unknown kind) without depending on real zod
 * compilation.
 */
const fakeSchemas = (result: ValidateResult): ArtifactSchemaRegistry =>
  ({ validate: () => result } as unknown as ArtifactSchemaRegistry);

/** Like {@link fakeSchemas} but records the `rawContent` it was validated with. */
const recordingSchemas = (
  result: ValidateResult,
): { registry: ArtifactSchemaRegistry; calls: string[] } => {
  const calls: string[] = [];
  const registry = {
    validate: (_kind: ArtifactKind, rawContent: string) => {
      calls.push(rawContent);
      return result;
    },
  } as unknown as ArtifactSchemaRegistry;
  return { registry, calls };
};

const buildCtx = async (params: {
  config: Readonly<Record<string, unknown>>;
  subjectBody: string;
  attempt?: number;
  validateResult: ValidateResult;
}): Promise<{ ctx: RunContext; subjectId: string }> => {
  const store = createFakeArtifactStore();
  const content = JSON.stringify({ format: "markdown", body: params.subjectBody });
  const subject = await store.put("Markdown", content, {
    payloadFormat: "json-v1",
  });
  const input: RunContextInput = {
    port: "subject",
    kind: "Markdown",
    content,
    payload: { format: "markdown", body: params.subjectBody },
    artifactId: subject.id,
  };
  const ctx: RunContext = {
    instanceId: asWorkflowId("wf-1"),
    stepExecId: asStepExecId("exec-fv-1"),
    stepId: asStepId("format-validate-1"),
    step: {
      id: asStepId("format-validate-1"),
      name: "validate",
      kind: "format.validate",
      actorRole: "Developer",
      config: params.config,
      humanGateRequired: false,
    },
    inputs: [input],
    loopHistory: [],
    attempt: params.attempt ?? 0,
    workspace: {},
    deps: {
      artifactStore: store,
      llm: undefined as never,
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
      artifactSchemas: fakeSchemas(params.validateResult),
    },
  };
  return { ctx, subjectId: subject.id };
};

const schemaError = (kind: string): ArtifactSchemaError =>
  new ArtifactSchemaError(kind as ArtifactKind, [
    { code: "invalid_type", path: ["title"], message: "Required" } as never,
    { code: "invalid_type", path: [], message: "Expected object" } as never,
  ]);

describe("format.validate runner", () => {
  it("routes to `approved` with the subject unchanged when the format is valid", async () => {
    const { ctx, subjectId } = await buildCtx({
      config: { expectedKind: "user:DemoJson@v1" },
      subjectBody: "valid",
      validateResult: { ok: true },
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced-on-port");
    if (outcome.kind !== "produced-on-port") return;
    expect(outcome.port).toBe("approved");
    expect(outcome.artifact.id).toBe(subjectId);
  });

  it("routes to `rejected` with judge feedback when invalid and attempts remain", async () => {
    const { ctx, subjectId } = await buildCtx({
      config: { expectedKind: "user:DemoJson@v1", maxAttempts: 3 },
      subjectBody: "bad",
      attempt: 0,
      validateResult: { ok: false, error: schemaError("user:DemoJson@v1") },
    });
    const outcome = await runner.run(ctx);
    expect(outcome.kind).toBe("produced-on-port");
    if (outcome.kind !== "produced-on-port") return;
    expect(outcome.port).toBe("rejected");
    expect(outcome.artifact.kind).toBe("Markdown");
    expect(outcome.artifact.id).not.toBe(subjectId);

    // The body must round-trip through `parseJudgeFeedback`: summary carries
    // the validation error, one comment per ZodIssue.
    const { content } = await ctx.deps.artifactStore.get(outcome.artifact.id);
    const { body } = JSON.parse(content) as { body: string };
    const parsed = parseJudgeFeedback(body);
    expect(parsed.summary).toContain("failed validation");
    expect(parsed.comments).toHaveLength(2);
    expect(parsed.comments[0].body).toContain("title");
    expect(parsed.comments[1].body).toContain("<root>");
  });

  it("routes to `exhausted` on the last allowed attempt (attempt >= maxAttempts - 1)", async () => {
    const { ctx } = await buildCtx({
      config: { expectedKind: "user:DemoJson@v1", maxAttempts: 3 },
      subjectBody: "bad",
      attempt: 2,
      validateResult: { ok: false, error: schemaError("user:DemoJson@v1") },
    });
    const outcome = await runner.run(ctx);
    if (outcome.kind !== "produced-on-port") throw new Error("expected produced-on-port");
    expect(outcome.port).toBe("exhausted");
  });

  it("uses the default maxAttempts of 3 when unset", async () => {
    const { ctx } = await buildCtx({
      config: { expectedKind: "user:DemoJson@v1" },
      subjectBody: "bad",
      attempt: 2, // 2 >= 3-1 → exhausted
      validateResult: { ok: false, error: schemaError("user:DemoJson@v1") },
    });
    const outcome = await runner.run(ctx);
    if (outcome.kind !== "produced-on-port") throw new Error("expected produced-on-port");
    expect(outcome.port).toBe("exhausted");
  });

  it("validates the unwrapped payload body, not the json-v1 envelope", async () => {
    // The subject is a Markdown artifact whose `body` carries the JSON the LLM
    // emitted. The runner must hand that body — not the `{format,body}`
    // envelope — to the schema, otherwise validation always rejects on the
    // envelope's keys. Regression for the demo run stuck on `exhausted`.
    const jsonBody = '{"keyword":"lumière","title":"x","poem":["a"],"verseCount":1}';
    const { ctx } = await buildCtx({
      config: { expectedKind: "user:DemoJson@v1" },
      subjectBody: jsonBody,
      validateResult: { ok: true },
    });
    const { registry, calls } = recordingSchemas({ ok: true });
    ctx.deps.artifactSchemas = registry;

    await runner.run(ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(jsonBody);
    // It must NOT be the raw envelope the store holds.
    expect(calls[0]).not.toContain('"format"');
  });

  it("strips a Markdown code fence around the body before validating", async () => {
    const jsonBody = '{"keyword":"lune"}';
    const { ctx } = await buildCtx({
      config: { expectedKind: "user:DemoJson@v1" },
      subjectBody: "```json\n" + jsonBody + "\n```",
      validateResult: { ok: true },
    });
    const { registry, calls } = recordingSchemas({ ok: true });
    ctx.deps.artifactSchemas = registry;

    await runner.run(ctx);

    expect(calls[0]).toBe(jsonBody);
  });

  it("throws when expectedKind is missing", async () => {
    const { ctx } = await buildCtx({
      config: {},
      subjectBody: "x",
      validateResult: { ok: true },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/expectedKind/);
  });

  it("throws (config error) when expectedKind is unknown to the registry", async () => {
    const { ctx } = await buildCtx({
      config: { expectedKind: "user:Nope@v1" },
      subjectBody: "x",
      validateResult: { ok: false, error: new UnknownArtifactKindError("user:Nope@v1") },
    });
    await expect(runner.run(ctx)).rejects.toThrow(/Unknown artifact kind/);
  });

  it("throws when the schema registry is absent from ctx.deps", async () => {
    const { ctx } = await buildCtx({
      config: { expectedKind: "user:DemoJson@v1" },
      subjectBody: "x",
      validateResult: { ok: true },
    });
    (ctx.deps as { artifactSchemas?: unknown }).artifactSchemas = undefined;
    await expect(runner.run(ctx)).rejects.toThrow(/registry not available/);
  });
});

describe("format.validate resolveSpec", () => {
  it("declares three output ports approved/rejected/exhausted", () => {
    const spec = runner.resolveSpec({ config: { expectedKind: "user:DemoJson@v1" } });
    expect(spec.outputs.map((o) => o.name)).toEqual(["approved", "rejected", "exhausted"]);
  });

  it("uses Markdown for rejected/exhausted regardless of approvedKind", () => {
    const spec = runner.resolveSpec({
      config: { expectedKind: "user:DemoJson@v1", approvedKind: "TechSpec" },
    });
    const byName = new Map(spec.outputs.map((o) => [o.name, o.kind]));
    expect(byName.get("approved")).toBe("TechSpec");
    expect(byName.get("rejected")).toBe("Markdown");
    expect(byName.get("exhausted")).toBe("Markdown");
  });
});
