import { afterEach, describe, expect, it } from "vitest";
import {
  createOrchestratorHarness,
  type OrchestratorHarness,
} from "../../__tests__/fixtures/orchestrator-harness";
import {
  asStepId,
  buildTemplate,
  ids,
  TEMPLATE_LINEAR,
} from "../../__tests__/fixtures/builders";
import { putArtifactPayload } from "../artifact-io";
import type { RunContext, StepRunner } from "../step-runner";

let harness: OrchestratorHarness | null = null;

afterEach(() => {
  harness?.stop();
  harness = null;
});

const refOf = (tpl: { id: string; version: string }) => `${tpl.id}@${tpl.version}`;

// ---------------------------------------------------------------------------
// Happy path, auto-validation, single-step exit
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — happy path", () => {
  it("runs user.input → human.gate, pauses, validates on submit, completes", async () => {
    harness = createOrchestratorHarness({ templates: [TEMPLATE_LINEAR] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(TEMPLATE_LINEAR),
      seeds: [{ kind: "Markdown", content: "hello" }],
    });

    await harness.waitForStatus(instanceId, "awaitingHuman");

    const bus = harness.fakes.bus;
    expect(bus.ofType("InstanceStarted")).toHaveLength(1);
    expect(bus.ofType("StepStarted")).toHaveLength(2);
    expect(bus.ofType("StepProducedArtifact")).toHaveLength(1);
    expect(bus.ofType("StepValidated")).toHaveLength(1); // user.input auto-validated
    expect(bus.ofType("StepAwaitingHumanGate")).toHaveLength(1);

    const inst = harness.state.getInstance(instanceId)!;
    const gateExec = inst.executions.find((e) => e.status === "awaitingHuman")!;
    expect(gateExec).toBeDefined();

    await harness.submitHumanDecision({
      instanceId,
      stepExecId: gateExec.id,
      by: "alice",
    });
    await harness.waitForStatus(instanceId, "completed");

    expect(bus.ofType("StepValidated").find((e) => e.by === "alice")).toBeDefined();
    expect(bus.ofType("InstanceCompleted")).toHaveLength(1);
    expect(harness.fakes.log.events.length).toBe(bus.published.length);
  });

  it("auto-validates a single user.input step and completes immediately", async () => {
    const template = buildTemplate(
      "auto-complete",
      [
        {
          id: "only",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
      ],
      [],
      { exitSteps: ["only"] },
    );
    harness = createOrchestratorHarness({ templates: [template] });

    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "x" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const bus = harness.fakes.bus;
    expect(bus.ofType("StepAwaitingHumanGate")).toHaveLength(0);
    expect(bus.ofType("StepValidated")).toHaveLength(1);
    expect(bus.ofType("InstanceCompleted")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Variables: writesTo + readsFrom
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — port-based wiring", () => {
  it("emits VariableAssigned when a step's output slot is bound via writesTo", async () => {
    const template = buildTemplate(
      "writes-to",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
          writesTo: { out: "specVar" },
        },
        {
          id: "gate",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
      ],
      [{ from: "input", to: "gate" }],
      {
        exitSteps: ["gate"],
        variables: [{ name: "specVar", kind: "Markdown" }],
      },
    );

    harness = createOrchestratorHarness({ templates: [template] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "hi" }],
    });
    await harness.waitForStatus(instanceId, "awaitingHuman");

    const assignments = harness.fakes.bus.ofType("VariableAssigned");
    expect(assignments).toHaveLength(1);
    expect(assignments[0].variableName).toBe("specVar");

    const inst = harness.state.getInstance(instanceId)!;
    const stored = inst.variables.get("specVar");
    expect(stored).toBe(assignments[0].artifactId);
  });

  it("resolves a downstream input from readsFrom over the upstream transition", async () => {
    const captured: RunContext[] = [];
    const captureRunner: StepRunner = {
      kind: "test.capture",
      resolveSpec: () => ({
        title: "capture",
        inputs: [{ name: "in", kinds: ["Markdown"] }],
        outputs: [{ name: "out", kind: "Markdown" }],
      }),
      async run(ctx) {
        captured.push(ctx);
        const artifact = await putArtifactPayload(
          ctx.deps.artifactStore,
          "Markdown",
          { format: "markdown", body: "captured" },
        );
        return { kind: "produced", artifact };
      },
    };

    const template = buildTemplate(
      "reads-from",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
          writesTo: { out: "specVar" },
        },
        {
          id: "cap",
          kind: "test.capture",
          humanGateRequired: false,
          readsFrom: { in: "specVar" },
        },
      ],
      [{ from: "input", to: "cap" }],
      {
        exitSteps: ["cap"],
        variables: [{ name: "specVar", kind: "Markdown" }],
      },
    );

    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [captureRunner],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "from-var" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    expect(captured).toHaveLength(1);
    const input = captured[0].inputs[0];
    expect(input.port).toBe("in");
    expect(input.kind).toBe("Markdown");
    const payload = JSON.parse(input.content) as { body: string };
    expect(payload.body).toBe("from-var");
  });
});

// ---------------------------------------------------------------------------
// Submit + advance
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — submitHumanDecision", () => {
  it("after a validate the orchestrator starts the next step", async () => {
    const template = buildTemplate(
      "two-gates",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
        {
          id: "g1",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
        {
          id: "g2",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
      ],
      [
        { from: "input", to: "g1" },
        { from: "g1", to: "g2" },
      ],
      { exitSteps: ["g2"] },
    );

    harness = createOrchestratorHarness({ templates: [template] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "data" }],
    });
    await harness.waitForStatus(instanceId, "awaitingHuman");

    const g1Exec = harness.state.getInstance(instanceId)!.executions.find(
      (e) => e.status === "awaitingHuman",
    )!;
    await harness.submitHumanDecision({
      instanceId,
      stepExecId: g1Exec.id,
      by: "carol",
    });
    await harness.waitForEvent(
      "StepAwaitingHumanGate",
      (e) => e.stepExecId !== g1Exec.id,
    );

    const inst = harness.state.getInstance(instanceId)!;
    const awaiting = inst.executions.filter((e) => e.status === "awaitingHuman");
    expect(awaiting).toHaveLength(1);
    const validatedByCarol = harness.fakes.bus
      .ofType("StepValidated")
      .find((e) => e.by === "carol");
    expect(validatedByCarol).toBeDefined();
    expect(validatedByCarol?.stepExecId).toBe(g1Exec.id);
  });
});

// ---------------------------------------------------------------------------
// Feedback loops
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — feedback loops", () => {
  const buildLoopTemplate = () =>
    buildTemplate(
      "loop-tpl",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
        { id: "cap", kind: "test.capture", humanGateRequired: false },
        {
          id: "gate",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
      ],
      [
        { from: "input", to: "cap" },
        { from: "cap", to: "gate" },
        { from: "gate", to: "cap", isLoop: true },
      ],
      { exitSteps: ["gate"] },
    );

  const buildCaptureRunner = (captured: RunContext[]): StepRunner => ({
    kind: "test.capture",
    resolveSpec: () => ({
      title: "capture",
      inputs: [{ name: "in", kinds: ["Markdown"] }],
      outputs: [{ name: "out", kind: "Markdown" }],
    }),
    async run(ctx) {
      captured.push(ctx);
      const artifact = await putArtifactPayload(
        ctx.deps.artifactStore,
        "Markdown",
        { format: "markdown", body: `capture-${captured.length}` },
      );
      return { kind: "produced", artifact };
    },
  });

  it("restarts the source step with loopHistory populated from human feedback", async () => {
    const captured: RunContext[] = [];
    const template = buildLoopTemplate();
    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [buildCaptureRunner(captured)],
    });

    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "awaitingHuman");

    expect(captured).toHaveLength(1);
    expect(captured[0].loopHistory).toHaveLength(0);

    const gateExec = harness.state.getInstance(instanceId)!.executions.find(
      (e) => e.status === "awaitingHuman",
    )!;
    await harness.openFeedbackLoop({
      instanceId,
      stepExecId: gateExec.id,
      toStepId: asStepId("cap"),
      reason: "please redo",
    });
    await harness.waitForEvent(
      "StepAwaitingHumanGate",
      (e) => e.stepExecId !== gateExec.id,
    );

    expect(captured).toHaveLength(2);
    expect(captured[1].loopHistory).toHaveLength(1);
    expect(captured[1].loopHistory[0].humanFeedback.summary).toBe("please redo");
    expect(captured[1].loopHistory[0].previousOutput).toBe("capture-1");
  });

  it("emits LoopOpened then LoopClosed once the target step has restarted", async () => {
    const captured: RunContext[] = [];
    const template = buildLoopTemplate();
    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [buildCaptureRunner(captured)],
    });

    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "awaitingHuman");

    const gateExec = harness.state.getInstance(instanceId)!.executions.find(
      (e) => e.status === "awaitingHuman",
    )!;
    await harness.openFeedbackLoop({
      instanceId,
      stepExecId: gateExec.id,
      toStepId: asStepId("cap"),
      reason: "loop",
    });
    await harness.waitForEvent("LoopClosed");

    const bus = harness.fakes.bus;
    expect(bus.ofType("LoopOpened")).toHaveLength(1);
    expect(bus.ofType("LoopClosed")).toHaveLength(1);
    const opened = bus.ofType("LoopOpened")[0];
    const closed = bus.ofType("LoopClosed")[0];
    expect(opened.author).toBe("user");
    expect(opened.loopId).toBe(closed.loopId);
  });

  it("rejects open-feedback-loop when the template has no loop edge for that pair", async () => {
    harness = createOrchestratorHarness({ templates: [TEMPLATE_LINEAR] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(TEMPLATE_LINEAR),
      seeds: [{ kind: "Markdown", content: "hi" }],
    });
    await harness.waitForStatus(instanceId, "awaitingHuman");
    const gateExec = harness.state.getInstance(instanceId)!.executions.find(
      (e) => e.status === "awaitingHuman",
    )!;

    await expect(
      harness.openFeedbackLoop({
        instanceId,
        stepExecId: gateExec.id,
        toStepId: asStepId("input"),
        reason: "redo",
      }),
    ).rejects.toThrow(/not permitted by template/);
  });

  it("rejects open-feedback-loop on an unknown stepExec", async () => {
    harness = createOrchestratorHarness({ templates: [TEMPLATE_LINEAR] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(TEMPLATE_LINEAR),
      seeds: [{ kind: "Markdown", content: "hi" }],
    });
    await harness.waitForStatus(instanceId, "awaitingHuman");

    await expect(
      harness.openFeedbackLoop({
        instanceId,
        stepExecId: ids.stepExec("ghost"),
        toStepId: asStepId("input"),
        reason: "redo",
      }),
    ).rejects.toThrow(/unknown stepExec/);
  });

  it("rejects open-feedback-loop on an unknown instance", async () => {
    harness = createOrchestratorHarness();
    await expect(
      harness.openFeedbackLoop({
        instanceId: ids.workflow("absent"),
        stepExecId: ids.stepExec("x"),
        toStepId: asStepId("y"),
        reason: "r",
      }),
    ).rejects.toThrow(/unknown instance/);
  });
});

// ---------------------------------------------------------------------------
// Branching (branch.bool) + StepSkipped
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — branching", () => {
  it("emits StepSkipped on the branch that was not chosen", async () => {
    const template = buildTemplate(
      "branch-tpl",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
        {
          id: "br",
          kind: "branch.bool",
          humanGateRequired: false,
          config: { cases: ["yes", "no"] },
        },
        {
          id: "gate-yes",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
        {
          id: "gate-no",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
      ],
      [
        { from: "input", to: "br" },
        { from: "br", to: "gate-yes", fromPort: "yes" },
        { from: "br", to: "gate-no", fromPort: "no" },
      ],
      { exitSteps: ["gate-yes", "gate-no"] },
    );

    harness = createOrchestratorHarness({ templates: [template] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "yes" }],
    });
    await harness.waitForStatus(instanceId, "awaitingHuman");

    const skipped = harness.fakes.bus.ofType("StepSkipped");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].stepId).toBe(asStepId("gate-no"));
    expect(skipped[0].cause.chosenPort).toBe("yes");

    const inst = harness.state.getInstance(instanceId)!;
    const gateYes = inst.executions.find((e) => e.stepId === asStepId("gate-yes"));
    const gateNo = inst.executions.find((e) => e.stepId === asStepId("gate-no"));
    expect(gateYes?.status).toBe("awaitingHuman");
    expect(gateNo?.status).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// Partial produced-many (multi-output with skip-propagation)
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — partial produced-many", () => {
  // Declares three ports but emits only two — the third is skip-propagated,
  // exactly like a `produced-on-port` branch (cf. shell.exec success/failure).
  const partialRunner: StepRunner = {
    kind: "test.multi",
    resolveSpec: () => ({
      title: "multi",
      inputs: [{ name: "in", kinds: ["Markdown"], optional: true }],
      outputs: [
        { name: "a", kind: "Markdown" },
        { name: "b", kind: "Markdown" },
        { name: "c", kind: "Markdown" },
      ],
    }),
    async run(ctx) {
      const mk = (body: string) =>
        putArtifactPayload(ctx.deps.artifactStore, "Markdown", {
          format: "markdown",
          body,
        });
      return {
        kind: "produced-many",
        artifacts: [
          { port: "a", artifact: await mk("a") },
          { port: "c", artifact: await mk("c") },
        ],
      };
    },
  };

  it("routes emitted ports and skip-propagates the absent one", async () => {
    const template = buildTemplate(
      "partial-many",
      [
        { id: "m", kind: "test.multi", humanGateRequired: false },
        {
          id: "ga",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
        {
          id: "gb",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
        {
          id: "gc",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
      ],
      [
        { from: "m", to: "ga", fromPort: "a" },
        { from: "m", to: "gb", fromPort: "b" },
        { from: "m", to: "gc", fromPort: "c" },
      ],
      { exitSteps: ["ga", "gb", "gc"] },
    );

    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [partialRunner],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    // Both taken edges (a, c) open a gate in the same `afterValidated` pass;
    // wait for the second one so the assertions don't race the routing loop.
    await harness.waitForEvent(
      "StepAwaitingHumanGate",
      () => harness!.fakes.bus.ofType("StepAwaitingHumanGate").length >= 2,
    );

    const skipped = harness.fakes.bus.ofType("StepSkipped");
    expect(skipped.map((e) => e.stepId)).toEqual([asStepId("gb")]);

    const inst = harness.state.getInstance(instanceId)!;
    const statusOf = (id: string) =>
      inst.executions.find((e) => e.stepId === asStepId(id))?.status;
    expect(statusOf("ga")).toBe("awaitingHuman");
    expect(statusOf("gc")).toBe("awaitingHuman");
    expect(statusOf("gb")).toBe("skipped");
  });

  it("fails the step when a produced-many slot names an undeclared port", async () => {
    const unknownPortRunner: StepRunner = {
      kind: "test.multi-bad",
      resolveSpec: () => ({
        title: "multi-bad",
        inputs: [{ name: "in", kinds: ["Markdown"], optional: true }],
        outputs: [{ name: "a", kind: "Markdown" }],
      }),
      async run(ctx) {
        const artifact = await putArtifactPayload(
          ctx.deps.artifactStore,
          "Markdown",
          { format: "markdown", body: "x" },
        );
        return { kind: "produced-many", artifacts: [{ port: "zzz", artifact }] };
      },
    };

    const template = buildTemplate(
      "partial-many-bad",
      [
        { id: "m", kind: "test.multi-bad", humanGateRequired: false },
        {
          id: "ga",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
      ],
      [{ from: "m", to: "ga", fromPort: "a" }],
      { exitSteps: ["ga"] },
    );

    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [unknownPortRunner],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "failed");

    const failed = harness.fakes.bus.ofType("StepFailed");
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toMatch(/unknown ports \[zzz\]/);
  });
});

// ---------------------------------------------------------------------------
// loop.foreach / loop.collect
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — iteration scopes", () => {
  it("fans out N iterations and collects them back into a list", async () => {
    const template = buildTemplate(
      "foreach-tpl",
      [
        {
          id: "fe",
          kind: "loop.foreach",
          humanGateRequired: false,
          config: { items: ["alpha", "beta"], itemKind: "Markdown" },
        },
        { id: "proc", kind: "concat.markdown", humanGateRequired: false },
        {
          id: "col",
          kind: "loop.collect",
          humanGateRequired: false,
          config: { itemKind: "Markdown" },
        },
      ],
      [
        { from: "fe", to: "proc", fromPort: "item", toPort: "main" },
        { from: "proc", to: "col", fromPort: "out", toPort: "item" },
      ],
      { exitSteps: ["col"] },
    );

    harness = createOrchestratorHarness({ templates: [template] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const bus = harness.fakes.bus;
    expect(bus.ofType("IterationStarted")).toHaveLength(2);
    const procStarts = bus
      .ofType("StepStarted")
      .filter((e) => e.stepId === asStepId("proc"));
    expect(procStarts).toHaveLength(2);
    expect(procStarts[0].iterationKey).toBe("fe:0");
    expect(procStarts[1].iterationKey).toBe("fe:1");

    const colStart = bus
      .ofType("StepStarted")
      .find((e) => e.stepId === asStepId("col"));
    expect(colStart).toBeDefined();
    expect(colStart?.iterationKey).toBeUndefined();

    const completed = bus.ofType("InstanceCompleted")[0];
    expect(completed.finalArtifact).toBeDefined();
    const finalStored = harness.fakes.artifactStore.getById(completed.finalArtifact!);
    expect(finalStored?.meta.kind).toBe("MarkdownList");
    expect(JSON.parse(finalStored!.content)).toEqual({
      format: "markdown-list",
      bodies: ["alpha", "beta"],
    });
  });

  it("fans out a generic List<Json> and collects it back into a List<Json>", async () => {
    // Identity body step: echoes the per-iteration Json item through, so the
    // scope has an in-scope step between foreach and collect (as a real
    // template would).
    const echoJson: StepRunner = {
      kind: "test.echo-json",
      resolveSpec: () => ({
        title: "echo-json",
        inputs: [{ name: "in", kinds: ["Json"], primary: true }],
        outputs: [{ name: "out", kind: "Json", primary: true }],
      }),
      async run(ctx) {
        const input = ctx.inputs[0];
        const artifact = await ctx.deps.artifactStore.put(
          "Json",
          input.content,
          { source: "test.echo-json" },
        );
        return { kind: "produced", artifact };
      },
    };

    const template = buildTemplate(
      "foreach-json-tpl",
      [
        {
          id: "fe",
          kind: "loop.foreach",
          humanGateRequired: false,
          // Static items are serialized to Json payloads (`{format,body}`).
          config: { items: ["1", "2"], itemKind: "Json" },
        },
        { id: "echo", kind: "test.echo-json", humanGateRequired: false },
        {
          id: "col",
          kind: "loop.collect",
          humanGateRequired: false,
          config: { itemKind: "Json" },
        },
      ],
      [
        { from: "fe", to: "echo", fromPort: "item", toPort: "in" },
        { from: "echo", to: "col", fromPort: "out", toPort: "item" },
      ],
      { exitSteps: ["col"] },
    );

    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [echoJson],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    expect(harness.fakes.bus.ofType("IterationStarted")).toHaveLength(2);
    const completed = harness.fakes.bus.ofType("InstanceCompleted")[0];
    const finalStored = harness.fakes.artifactStore.getById(
      completed.finalArtifact!,
    );
    expect(finalStored?.meta.kind).toBe("List<Json>");
    expect(JSON.parse(finalStored!.content)).toEqual({
      items: [
        { format: "json", body: "1" },
        { format: "json", body: "2" },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — failures", () => {
  it("emits StepFailed and stops the instance when a runner throws", async () => {
    const throwerRunner: StepRunner = {
      kind: "test.thrower",
      resolveSpec: () => ({
        title: "thrower",
        inputs: [{ name: "in", kinds: ["Markdown"] }],
        outputs: [{ name: "out", kind: "Markdown" }],
      }),
      async run() {
        throw new Error("boom from runner");
      },
    };

    const template = buildTemplate(
      "fails",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
        { id: "boom", kind: "test.thrower", humanGateRequired: false },
        {
          id: "never",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
      ],
      [
        { from: "input", to: "boom" },
        { from: "boom", to: "never" },
      ],
      { exitSteps: ["never"] },
    );

    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [throwerRunner],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "x" }],
    });
    await harness.waitForStatus(instanceId, "failed");

    const failed = harness.fakes.bus.ofType("StepFailed");
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toMatch(/boom from runner/);

    const startedSteps = harness.fakes.bus
      .ofType("StepStarted")
      .map((e) => e.stepId);
    expect(startedSteps).toContain(asStepId("input"));
    expect(startedSteps).toContain(asStepId("boom"));
    expect(startedSteps).not.toContain(asStepId("never"));
  });
});

// ---------------------------------------------------------------------------
// workspace.set side-effect
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — workspace.set", () => {
  it("emits WorkspaceChanged, updates instance cwd, and auto-validates", async () => {
    const template = buildTemplate(
      "ws",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
        {
          id: "ws",
          kind: "workspace.set",
          humanGateRequired: false,
          config: { cwd: "/tmp/test-ws" },
        },
        {
          id: "gate",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
      ],
      [
        { from: "input", to: "ws" },
        { from: "ws", to: "gate" },
      ],
      { exitSteps: ["gate"] },
    );

    harness = createOrchestratorHarness({ templates: [template] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "x" }],
    });
    await harness.waitForStatus(instanceId, "awaitingHuman");

    const wsChanged = harness.fakes.bus.ofType("WorkspaceChanged");
    expect(wsChanged).toHaveLength(1);
    expect(wsChanged[0].cwd).toBe("/tmp/test-ws");

    const inst = harness.state.getInstance(instanceId)!;
    expect(inst.cwd).toBe("/tmp/test-ws");
    const wsExec = inst.executions.find((e) => e.stepId === asStepId("ws"));
    expect(wsExec?.status).toBe("validated");
  });

  it("emits StepFailed when workspace.set is configured with an empty cwd", async () => {
    const template = buildTemplate(
      "ws-bad",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
        { id: "ws", kind: "workspace.set", humanGateRequired: false, config: {} },
      ],
      [{ from: "input", to: "ws" }],
      { exitSteps: ["ws"] },
    );
    harness = createOrchestratorHarness({ templates: [template] });

    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "x" }],
    });
    await harness.waitForStatus(instanceId, "failed");

    const failed = harness.fakes.bus.ofType("StepFailed");
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toMatch(/workspace\.set requires/);
  });
});

// ---------------------------------------------------------------------------
// Parallel instances
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — concurrency", () => {
  it("runs two distinct instances of the same template in parallel", async () => {
    harness = createOrchestratorHarness({ templates: [TEMPLATE_LINEAR] });

    const a = await harness.startInstance({
      templateRef: refOf(TEMPLATE_LINEAR),
      seeds: [{ kind: "Markdown", content: "A" }],
    });
    const b = await harness.startInstance({
      templateRef: refOf(TEMPLATE_LINEAR),
      seeds: [{ kind: "Markdown", content: "B" }],
    });

    await Promise.all([
      harness.waitForStatus(a.instanceId, "awaitingHuman"),
      harness.waitForStatus(b.instanceId, "awaitingHuman"),
    ]);

    expect(a.instanceId).not.toBe(b.instanceId);
    const aExec = harness.state.getInstance(a.instanceId)!.executions.find(
      (e) => e.status === "awaitingHuman",
    )!;
    const bExec = harness.state.getInstance(b.instanceId)!.executions.find(
      (e) => e.status === "awaitingHuman",
    )!;

    await harness.submitHumanDecision({
      instanceId: a.instanceId,
      stepExecId: aExec.id,
      by: "a-user",
    });
    await harness.waitForStatus(a.instanceId, "completed");
    expect(harness.state.getInstance(b.instanceId)?.status).toBe("awaitingHuman");

    await harness.submitHumanDecision({
      instanceId: b.instanceId,
      stepExecId: bExec.id,
      by: "b-user",
    });
    await harness.waitForStatus(b.instanceId, "completed");
  });
});

// ---------------------------------------------------------------------------
// start-instance side concerns
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — start-instance details", () => {
  it("trims whitespace from cwd and pins the active channelId from ChannelContext", async () => {
    harness = createOrchestratorHarness({ templates: [TEMPLATE_LINEAR] });
    harness.fakes.channels.setActive("my-channel");

    const { instanceId } = await harness.startInstance({
      templateRef: refOf(TEMPLATE_LINEAR),
      seeds: [{ kind: "Markdown", content: "x" }],
      cwd: "  /tmp/spaced  ",
    });

    const started = harness.fakes.bus.ofType("InstanceStarted")[0];
    expect(started.instanceId).toBe(instanceId);
    expect(started.cwd).toBe("/tmp/spaced");
    expect(started.channelId).toBe("my-channel");
  });
});
