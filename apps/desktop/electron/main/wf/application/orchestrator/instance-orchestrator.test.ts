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
// humanGateRequired on a single-`produced` step
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — humanGateRequired on a single-produced step", () => {
  // Regression: the plain `produced` branch (single artifact) used to emit
  // neither `StepValidated` nor `StepAwaitingHumanGate` when the step had
  // `humanGateRequired: true`, leaving it stuck in `running` forever. The
  // `produced-many` / `produced-on-port` branches already handled it; this
  // pins the third branch to the same behavior. `concat.markdown` returns a
  // single `produced` outcome, so it exercises exactly that path.
  it("opens the human gate, then advances after validation", async () => {
    const template = buildTemplate(
      "gated-produced",
      [
        {
          id: "src",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Markdown" },
        },
        { id: "gated", kind: "concat.markdown", humanGateRequired: true },
      ],
      [{ from: "src", to: "gated", fromPort: "out", toPort: "main" }],
      { exitSteps: ["gated"] },
    );

    harness = createOrchestratorHarness({ templates: [template] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "hello" }],
    });
    await harness.waitForStatus(instanceId, "awaitingHuman");

    expect(harness.fakes.bus.ofType("StepAwaitingHumanGate")).toHaveLength(1);
    const inst = harness.state.getInstance(instanceId)!;
    const gated = inst.executions.find((e) => e.status === "awaitingHuman")!;
    expect(gated.stepId).toBe(asStepId("gated"));

    await harness.submitHumanDecision({
      instanceId,
      stepExecId: gated.id,
      by: "alice",
    });
    await harness.waitForStatus(instanceId, "completed");
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

  it("branch.json routes on a JSON field, skips the other branch, reconverges the diamond", async () => {
    const template = buildTemplate(
      "branch-json-tpl",
      [
        {
          id: "input",
          kind: "user.input",
          humanGateRequired: false,
          config: { outputKind: "Json" },
        },
        {
          id: "br",
          kind: "branch.json",
          humanGateRequired: false,
          config: { path: "$.flag", cases: ["true", "false"], inputKind: "Json" },
        },
        {
          // Only reachable via the `false` port → must be skipped when `true`
          // is chosen.
          id: "only-false",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Json" },
        },
        {
          // Reached by BOTH branch ports (each into a distinct input port) →
          // reconverges the diamond: even though the `false` edge is
          // skip-propagated, the `true` edge feeds `main`, so this step runs.
          id: "merge",
          kind: "concat.markdown",
          humanGateRequired: false,
        },
      ],
      [
        { from: "input", to: "br" },
        { from: "br", to: "only-false", fromPort: "false" },
        { from: "br", to: "merge", fromPort: "true", toPort: "main" },
        { from: "br", to: "merge", fromPort: "false", toPort: "markdown1" },
      ],
      { exitSteps: ["only-false", "merge"] },
    );

    harness = createOrchestratorHarness({ templates: [template] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Json", content: '{"flag":true}' }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const skipped = harness.fakes.bus.ofType("StepSkipped");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].stepId).toBe(asStepId("only-false"));
    expect(skipped[0].cause.chosenPort).toBe("true");

    const inst = harness.state.getInstance(instanceId)!;
    const statusOf = (id: string) =>
      inst.executions.find((e) => e.stepId === asStepId(id))?.status;
    expect(statusOf("only-false")).toBe("skipped");
    // Diamond reconvergence: reached by the taken `true` edge → not skipped, runs.
    expect(statusOf("merge")).toBe("validated");
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
// loop.foreach writesTo.item — publish the current item as a per-iteration var
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — foreach writesTo.item", () => {
  // In-scope step reading the loop variable (not a data edge) and recording the
  // value it saw, so we can assert each iteration sees ITS item — not the last
  // one, not the whole list.
  const makeCapture = (seen: string[]): StepRunner => ({
    kind: "test.capture-json",
    resolveSpec: () => ({
      title: "capture-json",
      inputs: [{ name: "in", kinds: ["Json"], primary: true }],
      outputs: [{ name: "out", kind: "Json", primary: true }],
    }),
    async run(ctx) {
      const input = ctx.inputs[0];
      seen.push(JSON.parse(input.content).body as string);
      const artifact = await ctx.deps.artifactStore.put("Json", input.content, {
        source: "test.capture-json",
      });
      return { kind: "produced", artifact };
    },
  });

  const itemVarTemplate = (items: string[]) =>
    buildTemplate(
      "foreach-item-var",
      [
        {
          id: "fe",
          kind: "loop.foreach",
          humanGateRequired: false,
          config: { items, itemKind: "Json" },
          writesTo: { item: "cur" },
        },
        {
          id: "cap",
          kind: "test.capture-json",
          humanGateRequired: false,
          // Reads the loop variable, NOT a data edge from the item port.
          readsFrom: { in: "cur" },
        },
        {
          id: "col",
          kind: "loop.collect",
          humanGateRequired: false,
          config: { itemKind: "Json" },
        },
      ],
      [
        { from: "fe", to: "cap" },
        { from: "cap", to: "col", fromPort: "out", toPort: "item" },
      ],
      {
        exitSteps: ["col"],
        variables: [{ name: "cur", kind: "Json" }],
      },
    );

  it("each iteration sees its own item through the variable (not the last, not the list)", async () => {
    const seen: string[] = [];
    const template = itemVarTemplate(["1", "2", "3"]);
    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [makeCapture(seen)],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    expect(seen).toEqual(["1", "2", "3"]);
  });

  it("never writes the whole list artifact into the variable (§2)", async () => {
    const seen: string[] = [];
    const template = itemVarTemplate(["1", "2"]);
    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [makeCapture(seen)],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const assignments = harness.fakes.bus.ofType("VariableAssigned");
    // One per iteration, all under "cur" — and none of them is a List<Json>.
    expect(assignments).toHaveLength(2);
    for (const a of assignments) {
      expect(a.variableName).toBe("cur");
      const stored = harness.fakes.artifactStore.getById(a.artifactId);
      expect(stored?.meta.kind).toBe("Json");
    }
  });

  it("empty array emits no VariableAssigned and never defines the variable", async () => {
    const seen: string[] = [];
    const template = itemVarTemplate([]);
    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [makeCapture(seen)],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    // Empty list → foreach validates then short-circuits past its body; no
    // iteration ever starts, so no item is published. (Same drive pattern as
    // the sequential empty-array test — collect of an empty scope is orthogonal.)
    await harness.waitForEvent("StepValidated");
    await new Promise((r) => setTimeout(r, 50));

    expect(seen).toEqual([]);
    expect(harness.fakes.bus.ofType("VariableAssigned")).toHaveLength(0);
    const inst = harness.state.getInstance(instanceId)!;
    expect(inst.variables.get("cur")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sequential foreach (iterations always run strictly one at a time)
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — sequential foreach", () => {
  // Body chain fe → A → B → col, so iteration i+1's first body step (A) can be
  // observed to start only after iteration i's last body step (B) validates.
  // `loop.foreach` always runs its iterations strictly one at a time.
  const chainTemplate = (opts: { items: string[] }) =>
    buildTemplate(
      "seq-foreach",
      [
        {
          id: "fe",
          kind: "loop.foreach",
          humanGateRequired: false,
          config: {
            items: opts.items,
            itemKind: "Markdown",
          },
        },
        { id: "A", kind: "concat.markdown", humanGateRequired: false },
        { id: "B", kind: "concat.markdown", humanGateRequired: false },
        {
          id: "col",
          kind: "loop.collect",
          humanGateRequired: false,
          config: { itemKind: "Markdown" },
        },
      ],
      [
        { from: "fe", to: "A", fromPort: "item", toPort: "main" },
        { from: "A", to: "B", fromPort: "out", toPort: "main" },
        { from: "B", to: "col", fromPort: "out", toPort: "item" },
      ],
      { exitSteps: ["col"] },
    );

  /**
   * Linear trace of `start <step>@<key>` / `valid <step>@<key>` over the
   * published events. `StepValidated` carries only a `stepExecId`, so we map it
   * back to its `StepStarted` (which carries `stepId` + `iterationKey`).
   */
  const trace = (bus: OrchestratorHarness["fakes"]["bus"]): string[] => {
    const meta = new Map<string, { stepId: string; key: string }>();
    for (const e of bus.published) {
      if (e.type === "StepStarted") {
        meta.set(e.stepExecId, {
          stepId: String(e.stepId),
          key: e.iterationKey ?? "-",
        });
      }
    }
    const out: string[] = [];
    for (const e of bus.published) {
      if (e.type === "StepStarted") {
        out.push(`start ${String(e.stepId)}@${e.iterationKey ?? "-"}`);
      } else if (e.type === "StepValidated") {
        const m = meta.get(e.stepExecId);
        if (m) out.push(`valid ${m.stepId}@${m.key}`);
      }
    }
    return out;
  };

  it("runs iterations strictly one at a time, in index order", async () => {
    const template = chainTemplate({
      items: ["a", "b", "c"],
    });
    harness = createOrchestratorHarness({ templates: [template] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const t = trace(harness.fakes.bus);
    const at = (label: string) => t.indexOf(label);

    // Iteration i+1's body cannot start before iteration i's body fully
    // validated (B is the last body step).
    expect(at("valid B@fe:0")).toBeLessThan(at("start A@fe:1"));
    expect(at("valid B@fe:1")).toBeLessThan(at("start A@fe:2"));
    // No overlap of iteration keys: A@fe:1 starts after B@fe:0 even started.
    expect(at("start B@fe:0")).toBeLessThan(at("start A@fe:1"));
    expect(at("start B@fe:1")).toBeLessThan(at("start A@fe:2"));
    expect(harness.fakes.bus.ofType("IterationStarted")).toHaveLength(3);
  });

  it("empty array starts no iteration body (sequential short-circuit)", async () => {
    const template = chainTemplate({ items: [] });
    harness = createOrchestratorHarness({ templates: [template] });
    await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    // The foreach validates (it produced its — empty — list) then takes the
    // short-circuit branch instead of fanning out. `slice(0, 1)` of an empty
    // record set stays empty, so no iteration body starts.
    await harness.waitForEvent("StepValidated");
    await new Promise((r) => setTimeout(r, 50));

    expect(harness.fakes.bus.ofType("IterationStarted")).toHaveLength(0);
    const aStarted = harness.fakes.bus
      .ofType("StepStarted")
      .some((e) => e.stepId === asStepId("A"));
    expect(aStarted).toBe(false);
  });

  it("a single item behaves identically in sequential mode", async () => {
    const template = chainTemplate({ items: ["only"] });
    harness = createOrchestratorHarness({ templates: [template] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    expect(harness.fakes.bus.ofType("IterationStarted")).toHaveLength(1);
    expect(harness.fakes.bus.ofType("InstanceCompleted")).toHaveLength(1);
  });

  it("pauses on a human.gate per iteration and only advances after validation", async () => {
    // Body fe → A → gate. The gate is the boundary step before collect; we
    // assert the pause/advance mechanics (we do not drive to completion — a
    // passthrough gate before a collect is orthogonal to this spec).
    const template = buildTemplate(
      "seq-gate",
      [
        {
          id: "fe",
          kind: "loop.foreach",
          humanGateRequired: false,
          config: { items: ["x", "y"], itemKind: "Markdown" },
        },
        { id: "A", kind: "concat.markdown", humanGateRequired: false },
        {
          id: "gate",
          kind: "human.gate",
          humanGateRequired: true,
          config: { inputKind: "Markdown" },
        },
        {
          id: "col",
          kind: "loop.collect",
          humanGateRequired: false,
          config: { itemKind: "Markdown" },
        },
      ],
      [
        { from: "fe", to: "A", fromPort: "item", toPort: "main" },
        { from: "A", to: "gate", fromPort: "out", toPort: "artifact" },
        { from: "gate", to: "col", toPort: "item" },
      ],
      { exitSteps: ["col"] },
    );

    harness = createOrchestratorHarness({ templates: [template] });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "awaitingHuman");

    const startedBefore = harness.fakes.bus
      .ofType("StepStarted")
      .filter((e) => e.stepId === asStepId("A"))
      .map((e) => e.iterationKey);
    // Only iteration 0's body has started.
    expect(startedBefore).toEqual(["fe:0"]);
    expect(harness.fakes.bus.ofType("StepAwaitingHumanGate")).toHaveLength(1);

    // Validate iteration 0's gate → iteration 1's body must start.
    const inst = harness.state.getInstance(instanceId)!;
    const gate0 = inst.executions.find((e) => e.status === "awaitingHuman")!;
    expect(gate0.iterationKey).toBe("fe:0");
    await harness.submitHumanDecision({
      instanceId,
      stepExecId: gate0.id,
      by: "alice",
    });

    await harness.waitForEvent(
      "StepStarted",
      (e) => e.stepId === asStepId("gate") && e.iterationKey === "fe:1",
    );
    const gateKeys = harness.fakes.bus
      .ofType("StepStarted")
      .filter((e) => e.stepId === asStepId("gate"))
      .map((e) => e.iterationKey);
    expect(gateKeys).toEqual(["fe:0", "fe:1"]);
  });

  it("fail-fast: a failed iteration stops the series, later iterations never start", async () => {
    const failOnBoom: StepRunner = {
      kind: "test.fail-on-boom",
      resolveSpec: () => ({
        title: "fail-on-boom",
        inputs: [{ name: "in", kinds: ["Markdown"], primary: true }],
        outputs: [{ name: "out", kind: "Markdown", primary: true }],
      }),
      async run(ctx) {
        if (ctx.inputs[0]?.content.includes("boom")) {
          throw new Error("intentional failure on this item");
        }
        const artifact = await putArtifactPayload(
          ctx.deps.artifactStore,
          "Markdown",
          { format: "markdown", body: "ok" },
          { source: "test.fail-on-boom" },
        );
        return { kind: "produced", artifact };
      },
    };

    const template = buildTemplate(
      "seq-failfast",
      [
        {
          id: "fe",
          kind: "loop.foreach",
          humanGateRequired: false,
          config: {
            items: ["ok-0", "boom-1", "ok-2"],
            itemKind: "Markdown",
          },
        },
        { id: "A", kind: "test.fail-on-boom", humanGateRequired: false },
        {
          id: "col",
          kind: "loop.collect",
          humanGateRequired: false,
          config: { itemKind: "Markdown" },
        },
      ],
      [
        { from: "fe", to: "A", fromPort: "item", toPort: "in" },
        { from: "A", to: "col", fromPort: "out", toPort: "item" },
      ],
      { exitSteps: ["col"] },
    );

    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [failOnBoom],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "failed");

    expect(harness.fakes.bus.ofType("StepFailed")).toHaveLength(1);
    const aKeys = harness.fakes.bus
      .ofType("StepStarted")
      .filter((e) => e.stepId === asStepId("A"))
      .map((e) => e.iterationKey);
    // Iteration 0 ran, iteration 1 failed, iteration 2 never started.
    expect(aKeys).toEqual(["fe:0", "fe:1"]);
    const colStarted = harness.fakes.bus
      .ofType("StepStarted")
      .some((e) => e.stepId === asStepId("col"));
    expect(colStarted).toBe(false);
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
