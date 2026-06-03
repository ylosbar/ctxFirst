/**
 * End-to-end orchestrator tests for `template.invoke` (Approach A,
 * `sub-template-invoke.md` §5/§13). A parent step spawns a child instance,
 * suspends in `awaitingChild`, and resumes when the child terminates — its
 * outputs flowing back into the parent's variables.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  createOrchestratorHarness,
  type OrchestratorHarness,
} from "../../__tests__/fixtures/orchestrator-harness";
import { buildTemplate } from "../../__tests__/fixtures/builders";
import { putArtifactPayload } from "../artifact-io";
import type { RunContext, StepOutcome, StepRunner } from "../step-runner";
import type { WorkflowTemplate } from "../../domain/template";
import { createTemplateInvokeRunner } from "../../plugins/template-invoke";

let harness: OrchestratorHarness | null = null;
afterEach(() => {
  harness?.stop();
  harness = null;
});

const refOf = (tpl: { id: string; version: string }) => `${tpl.id}@${tpl.version}`;

/** Echoes its first input to a Markdown artifact (`echo:<content>`). */
const echoRunner: StepRunner = {
  kind: "test.echo",
  resolveSpec: () => ({
    title: "echo",
    inputs: [{ name: "in", kinds: ["*"] }],
    outputs: [{ name: "out", kind: "Markdown" }],
  }),
  async run(ctx: RunContext): Promise<StepOutcome> {
    const body = ctx.inputs[0]?.content ?? "";
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      { format: "markdown", body: `echo:${body}` },
      { source: "test.echo" },
    );
    return { kind: "produced", artifact };
  },
};

/** Always fails — used to drive a child instance to a terminal `failed`. */
const boomRunner: StepRunner = {
  kind: "test.boom",
  resolveSpec: () => ({
    title: "boom",
    inputs: [{ name: "in", kinds: ["*"] }],
    outputs: [{ name: "out", kind: "Markdown" }],
  }),
  async run(): Promise<StepOutcome> {
    throw new Error("boom");
  },
};

/** Sub-template B: input `spec` → echo → output `summary`. */
const childB: WorkflowTemplate = buildTemplate(
  "B",
  [{ id: "body", kind: "test.echo", readsFrom: { in: "spec" }, writesTo: { out: "summary" } }],
  [],
  {
    id: "B",
    status: "published",
    exitSteps: ["body"],
    variables: [
      { name: "spec", kind: "Markdown", role: "input" },
      { name: "summary", kind: "Markdown", role: "output" },
    ],
  },
);

/** Sub-template Bfail: input `spec` → boom (fails). Input-only interface. */
const childBfail: WorkflowTemplate = buildTemplate(
  "Bfail",
  [{ id: "body", kind: "test.boom", readsFrom: { in: "spec" } }],
  [],
  {
    id: "Bfail",
    status: "published",
    exitSteps: ["body"],
    variables: [{ name: "spec", kind: "Markdown", role: "input" }],
  },
);

/**
 * Root A: seed (user.input → specVar) → invoke(child) → tail (echo summaryVar).
 */
const makeRootA = (childId: string): WorkflowTemplate =>
  buildTemplate(
    "A",
    [
      {
        id: "seed",
        kind: "user.input",
        config: { outputKind: "Markdown" },
        writesTo: { out: "specVar" },
      },
      {
        id: "inv",
        kind: "template.invoke",
        config: { templateId: childId, templateVersion: "v1" },
        readsFrom: { spec: "specVar" },
        writesTo: { summary: "summaryVar" },
      },
      { id: "tail", kind: "test.echo", readsFrom: { in: "summaryVar" } },
    ],
    [
      { from: "seed", to: "inv" },
      { from: "inv", to: "tail" },
    ],
    {
      id: "A",
      status: "published",
      entryStep: "seed",
      exitSteps: ["tail"],
      variables: [
        { name: "specVar", kind: "Markdown" },
        { name: "summaryVar", kind: "Markdown" },
      ],
    },
  );

const makeHarness = (templates: WorkflowTemplate[]): OrchestratorHarness => {
  const byRef = new Map(templates.map((t) => [refOf(t), t]));
  const invokeRunner = createTemplateInvokeRunner({
    getChild: (ref) => byRef.get(`${ref.templateId}@${ref.templateVersion}`),
  });
  return createOrchestratorHarness({
    templates,
    extraRunners: [echoRunner, boomRunner, invokeRunner],
  });
};

describe("InstanceOrchestrator — template.invoke", () => {
  it("spawns a child, waits, then advances the parent with the child's output", async () => {
    const A = makeRootA("B");
    harness = makeHarness([A, childB]);

    const { instanceId } = await harness.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "hello" }],
    });

    const spawned = await harness.waitForEvent("ChildInstanceSpawned");
    expect(spawned.childTemplateId).toBe("B");
    expect(spawned.seedBindings).toHaveLength(1);
    expect(spawned.seedBindings[0]?.variableName).toBe("spec");

    await harness.waitForStatus(instanceId, "completed");

    const bus = harness.fakes.bus;
    // Two instances started: the root A and the child B.
    expect(bus.ofType("InstanceStarted")).toHaveLength(2);
    expect(bus.ofType("ChildInstanceSpawned")).toHaveLength(1);
    expect(bus.ofType("ChildInstanceCompleted")).toHaveLength(1);
    const completed = bus.ofType("ChildInstanceCompleted")[0];
    expect(completed.outcome).toBe("completed");
    expect(completed.outputs.map((o) => o.variableName)).toContain("summary");

    // The child instance is filiated to A's invoke exec, at depth 1.
    const child = harness.state.getInstance(spawned.childInstanceId)!;
    expect(child.parent?.instanceId).toBe(instanceId);
    expect(child.parent?.stepExecId).toBe(spawned.stepExecId);
    expect(child.depth).toBe(1);
    expect(child.status).toBe("completed");

    // The parent advanced: summaryVar was assigned from the child's output and
    // the trailing step read it.
    const parent = harness.state.getInstance(instanceId)!;
    expect(parent.variables.get("summaryVar")).toBe(
      completed.outputs.find((o) => o.variableName === "summary")?.artifactId,
    );
    expect(parent.status).toBe("completed");
  });

  it("fails the parent when the child instance fails", async () => {
    const A = makeRootA("Bfail");
    harness = makeHarness([A, childBfail]);

    const { instanceId } = await harness.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "hello" }],
    });

    await harness.waitForStatus(instanceId, "failed");

    const bus = harness.fakes.bus;
    const completed = bus.ofType("ChildInstanceCompleted")[0];
    expect(completed.outcome).toBe("failed");
    expect(completed.error).toContain("boom");

    const parent = harness.state.getInstance(instanceId)!;
    const invExec = parent.executions.find((e) => e.stepId === "inv")!;
    expect(invExec.status).toBe("failed");
    expect(parent.status).toBe("failed");
  });

  it("the child inherits the parent's channelId, not the active UI channel", async () => {
    const A = makeRootA("B");
    harness = makeHarness([A, childB]);
    // The active channel differs from the one the run is pinned to.
    harness.fakes.channels.setActive("ui-active-channel");

    const { instanceId } = await harness.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "hi" }],
      channelId: "tenant-X",
    });

    const spawned = await harness.waitForEvent("ChildInstanceSpawned");
    await harness.waitForStatus(instanceId, "completed");

    const child = harness.state.getInstance(spawned.childInstanceId)!;
    expect(child.channelId).toBe("tenant-X");
    // The child shows up in the tenant's listing, never the active UI channel's.
    expect(harness.state.listInstanceIds("tenant-X")).toContain(spawned.childInstanceId);
    expect(harness.state.listInstanceIds("ui-active-channel")).not.toContain(
      spawned.childInstanceId,
    );
  });
});
