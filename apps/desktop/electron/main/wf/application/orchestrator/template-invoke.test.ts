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
import { createFakeIdGenerator } from "../../__tests__/fixtures/fake-ids";
import { putArtifactPayload } from "../artifact-io";
import type { RunContext, StepOutcome, StepRunner } from "../step-runner";
import type { DomainEvent } from "../../domain/events";
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

/** Emits a fixed Markdown body taken from `config.marker` (ignores inputs). */
const constRunner: StepRunner = {
  kind: "test.const",
  resolveSpec: () => ({
    title: "const",
    inputs: [{ name: "in", kinds: ["*"] }],
    outputs: [{ name: "out", kind: "Markdown" }],
  }),
  async run(ctx: RunContext): Promise<StepOutcome> {
    const marker = typeof ctx.step.config["marker"] === "string" ? ctx.step.config["marker"] : "";
    const artifact = await putArtifactPayload(
      ctx.deps.artifactStore,
      "Markdown",
      { format: "markdown", body: marker },
      { source: "test.const" },
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

type RootOpts = {
  /** Child input variable bound by the invoke's readsFrom. Default "spec". */
  inputName?: string;
  /** Child output variable bound by the invoke's writesTo. Default "summary". */
  outputName?: string;
  /** Extra keys merged into the invoke step's config (e.g. a cwd override). */
  invConfig?: Record<string, unknown>;
  /** Insert a human.gate between seed and invoke (lets a test pause the run). */
  gateBeforeInvoke?: boolean;
};

/**
 * Root A: seed (user.input → specVar) → [gate] → invoke(child) → tail (echo
 * summaryVar). Generic over the child's interface variable names.
 */
const makeRootA = (childId: string, opts: RootOpts = {}): WorkflowTemplate => {
  const inputName = opts.inputName ?? "spec";
  const outputName = opts.outputName ?? "summary";
  const steps: Parameters<typeof buildTemplate>[1][number][] = [
    {
      id: "seed",
      kind: "user.input",
      config: { outputKind: "Markdown" },
      writesTo: { out: "specVar" },
    },
  ];
  const transitions: Parameters<typeof buildTemplate>[2][number][] = [];
  if (opts.gateBeforeInvoke) {
    steps.push({ id: "gate", kind: "human.gate", humanGateRequired: true, config: { inputKind: "Markdown" } });
    transitions.push({ from: "seed", to: "gate" }, { from: "gate", to: "inv" });
  } else {
    transitions.push({ from: "seed", to: "inv" });
  }
  steps.push(
    {
      id: "inv",
      kind: "template.invoke",
      config: { templateId: childId, templateVersion: "v1", ...(opts.invConfig ?? {}) },
      readsFrom: { [inputName]: "specVar" },
      writesTo: { [outputName]: "summaryVar" },
    },
    { id: "tail", kind: "test.echo", readsFrom: { in: "summaryVar" } },
  );
  transitions.push({ from: "inv", to: "tail" });
  return buildTemplate("A", steps, transitions, {
    id: "A",
    status: "published",
    entryStep: "seed",
    exitSteps: ["tail"],
    variables: [
      { name: "specVar", kind: "Markdown" },
      { name: "summaryVar", kind: "Markdown" },
    ],
  });
};

const makeHarness = (
  templates: WorkflowTemplate[],
  autoStart = true,
): OrchestratorHarness => {
  const byRef = new Map(templates.map((t) => [refOf(t), t]));
  const invokeRunner = createTemplateInvokeRunner({
    getChild: (ref) => byRef.get(`${ref.templateId}@${ref.templateVersion}`),
  });
  return createOrchestratorHarness({
    templates,
    extraRunners: [echoRunner, boomRunner, constRunner, invokeRunner],
    autoStart,
  });
};

/**
 * Builds a harness whose orchestrator is NOT started, replays `log` into the
 * read model (events applied without the orchestrator reacting — mirrors boot
 * re-hydration), and returns it ready for `orchestrator.start()`.
 *
 * Shares `priorStore` (so artifacts referenced by replayed events still
 * resolve) and uses a distinct id prefix (so reconcile-minted ids can't collide
 * with the ids embedded in the replayed log).
 */
const buildReplayHarness = async (
  templates: WorkflowTemplate[],
  log: ReadonlyArray<DomainEvent>,
  priorStore: OrchestratorHarness["fakes"]["artifactStore"],
): Promise<OrchestratorHarness> => {
  const byRef = new Map(templates.map((t) => [refOf(t), t]));
  const invokeRunner = createTemplateInvokeRunner({
    getChild: (ref) => byRef.get(`${ref.templateId}@${ref.templateVersion}`),
  });
  const h = createOrchestratorHarness({
    templates,
    extraRunners: [echoRunner, boomRunner, constRunner, invokeRunner],
    autoStart: false,
    ids: createFakeIdGenerator("boot"),
    artifactStore: priorStore,
  });
  for (const evt of log) await h.fakes.bus.publish(evt);
  return h;
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

// ---------------------------------------------------------------------------
// §15a — template.invoke inside a loop.foreach scope
// ---------------------------------------------------------------------------

/** Sub-template Bitem: input `in` → echo → output `out`. */
const childBitem: WorkflowTemplate = buildTemplate(
  "Bitem",
  [{ id: "body", kind: "test.echo", readsFrom: { in: "in" }, writesTo: { out: "out" } }],
  [],
  {
    id: "Bitem",
    status: "published",
    exitSteps: ["body"],
    variables: [
      { name: "in", kind: "Markdown", role: "input" },
      { name: "out", kind: "Markdown", role: "output" },
    ],
  },
);

/**
 * Root with a `template.invoke` inside a `loop.foreach` scope:
 *   seed → fe → inv(child) → col
 * The invoke seeds its child from `seedVar` (§5a — seeds resolve from variables;
 * sequential is the safe per-item regime). The foreach drives one child per
 * item; collect joins the per-iteration child outputs.
 */
const makeForeachRoot = (sequential: boolean, items: string[]): WorkflowTemplate =>
  buildTemplate(
    "Afe",
    [
      {
        id: "seed",
        kind: "user.input",
        config: { outputKind: "Markdown" },
        writesTo: { out: "seedVar" },
      },
      {
        id: "fe",
        kind: "loop.foreach",
        config: { items, itemKind: "Markdown", sequential },
      },
      {
        id: "inv",
        kind: "template.invoke",
        config: { templateId: "Bitem", templateVersion: "v1" },
        readsFrom: { in: "seedVar" },
        writesTo: { out: "resVar" },
      },
      { id: "col", kind: "loop.collect", config: { itemKind: "Markdown" } },
    ],
    [
      { from: "seed", to: "fe" },
      { from: "fe", to: "inv", fromPort: "item", toPort: "in" },
      { from: "inv", to: "col", fromPort: "out", toPort: "item" },
    ],
    {
      id: "Afe",
      status: "published",
      entryStep: "seed",
      exitSteps: ["col"],
      variables: [
        { name: "seedVar", kind: "Markdown" },
        { name: "resVar", kind: "Markdown" },
      ],
    },
  );

describe("InstanceOrchestrator — template.invoke inside loop.foreach", () => {
  it("parallel foreach fans out one child per item before any completes", async () => {
    const A = makeForeachRoot(false, ["a", "b", "c"]);
    harness = makeHarness([A, childBitem]);
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const published = harness.fakes.bus.published;
    const spawnedIdx = published
      .map((e, i) => (e.type === "ChildInstanceSpawned" ? i : -1))
      .filter((i) => i >= 0);
    const completedIdx = published
      .map((e, i) => (e.type === "ChildInstanceCompleted" ? i : -1))
      .filter((i) => i >= 0);

    expect(spawnedIdx).toHaveLength(3);
    expect(completedIdx).toHaveLength(3);
    // Distinct exec per iteration (the wake targets the exact iteration).
    const spawnExecs = new Set(
      harness.fakes.bus.ofType("ChildInstanceSpawned").map((e) => e.stepExecId),
    );
    expect(spawnExecs.size).toBe(3);
    // Fan-out discriminator: every child is spawned before the first completes.
    expect(Math.max(...spawnedIdx)).toBeLessThan(Math.min(...completedIdx));
    expect(harness.fakes.bus.ofType("InstanceStarted")).toHaveLength(4); // root + 3 children
  });

  it("sequential foreach spawns the next child only after the prior completes", async () => {
    const A = makeForeachRoot(true, ["a", "b", "c"]);
    harness = makeHarness([A, childBitem]);
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const published = harness.fakes.bus.published;
    const spawnedIdx = published
      .map((e, i) => (e.type === "ChildInstanceSpawned" ? i : -1))
      .filter((i) => i >= 0);
    const completedIdx = published
      .map((e, i) => (e.type === "ChildInstanceCompleted" ? i : -1))
      .filter((i) => i >= 0);

    expect(spawnedIdx).toHaveLength(3);
    expect(completedIdx).toHaveLength(3);
    // Strictly one child alive at a time: spawn[k] only after completed[k-1].
    expect(completedIdx[0]).toBeLessThan(spawnedIdx[1]);
    expect(completedIdx[1]).toBeLessThan(spawnedIdx[2]);
  });
});

// ---------------------------------------------------------------------------
// §16 — boot reconciliation re-links a parent orphaned by a crash
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — boot reconciliation (§16)", () => {
  it("wakes a parent left in awaitingChild when its child terminated during a crash", async () => {
    const A = makeRootA("B");

    // (1) Run a complete invoke to capture a realistic event log.
    const h1 = makeHarness([A, childB]);
    const { instanceId: parentId } = await h1.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "hello" }],
    });
    const spawned = await h1.waitForEvent("ChildInstanceSpawned");
    await h1.waitForStatus(parentId, "completed");
    const fullLog = [...h1.fakes.log.events];
    const priorStore = h1.fakes.artifactStore;
    h1.stop();

    // (2) Simulate the crash: truncate the persisted log right before the
    // first `ChildInstanceCompleted` (the child's terminal `InstanceCompleted`
    // is persisted, the parent's wake never was).
    const cut = fullLog.findIndex((e) => e.type === "ChildInstanceCompleted");
    expect(cut).toBeGreaterThan(0);
    const crashLog = fullLog.slice(0, cut);

    // (3) Re-hydrate into a fresh, NOT-yet-started orchestrator.
    harness = await buildReplayHarness([A, childB], crashLog, priorStore);

    // Parent is stuck on awaitingChild; the child is already completed.
    const parentBefore = harness.state.getInstance(parentId)!;
    const invBefore = parentBefore.executions.find((e) => e.stepId === "inv")!;
    expect(invBefore.status).toBe("awaitingChild");
    expect(harness.state.getInstance(spawned.childInstanceId)?.status).toBe("completed");

    // (4) Boot: the reconciliation pass re-links and advances the parent.
    harness.orchestrator.start();
    await harness.waitForStatus(parentId, "completed");

    // Idempotent: exactly one ChildInstanceCompleted was emitted (by reconcile;
    // the replayed log had none).
    expect(harness.fakes.bus.ofType("ChildInstanceCompleted")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Three-level hierarchy A → B → C (completion + error propagation)
// ---------------------------------------------------------------------------

/** Leaf C: input `cin` → echo → output `cout`. */
const leafC: WorkflowTemplate = buildTemplate(
  "C3",
  [{ id: "body", kind: "test.echo", readsFrom: { in: "cin" }, writesTo: { out: "cout" } }],
  [],
  {
    id: "C3",
    status: "published",
    exitSteps: ["body"],
    variables: [
      { name: "cin", kind: "Markdown", role: "input" },
      { name: "cout", kind: "Markdown", role: "output" },
    ],
  },
);

/** Middle B: input `bin` → invoke(C3) → output `bout`. */
const midB: WorkflowTemplate = buildTemplate(
  "B3",
  [
    {
      id: "invC",
      kind: "template.invoke",
      config: { templateId: "C3", templateVersion: "v1" },
      readsFrom: { cin: "bin" },
      writesTo: { cout: "bout" },
    },
  ],
  [],
  {
    id: "B3",
    status: "published",
    entryStep: "invC",
    exitSteps: ["invC"],
    variables: [
      { name: "bin", kind: "Markdown", role: "input" },
      { name: "bout", kind: "Markdown", role: "output" },
    ],
  },
);

/** Middle Bf: input `bin` → invoke(Bfail, which booms) — input-only interface. */
const midBfail: WorkflowTemplate = buildTemplate(
  "B3fail",
  [
    {
      id: "invCf",
      kind: "template.invoke",
      config: { templateId: "Bfail", templateVersion: "v1" },
      readsFrom: { spec: "bin" },
    },
  ],
  [],
  {
    id: "B3fail",
    status: "published",
    entryStep: "invCf",
    exitSteps: ["invCf"],
    variables: [{ name: "bin", kind: "Markdown", role: "input" }],
  },
);

describe("InstanceOrchestrator — three-level hierarchy", () => {
  it("propagates completion up A → B → C", async () => {
    const A = makeRootA("B3", { inputName: "bin", outputName: "bout" });
    harness = makeHarness([A, midB, leafC]);
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "hello" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    // Four instances: root A + child B + grandchild C.
    const started = harness.fakes.bus.ofType("InstanceStarted");
    expect(started).toHaveLength(3);
    const depths = started.map((e) => e.depth ?? 0).sort();
    expect(depths).toEqual([0, 1, 2]);

    // Every spawned instance reached completed.
    const spawns = harness.fakes.bus.ofType("ChildInstanceSpawned");
    expect(spawns).toHaveLength(2);
    for (const s of spawns) {
      expect(harness.state.getInstance(s.childInstanceId)?.status).toBe("completed");
    }
    expect(harness.state.getInstance(instanceId)?.status).toBe("completed");
  });

  it("propagates failure up C → B → A", async () => {
    const A = makeRootA("B3fail", { inputName: "bin" });
    harness = makeHarness([A, midBfail, childBfail]);
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "hello" }],
    });
    await harness.waitForStatus(instanceId, "failed");

    // Both the grandchild (Bfail) and the child (B3fail) instances ended failed.
    const spawns = harness.fakes.bus.ofType("ChildInstanceSpawned");
    expect(spawns).toHaveLength(2);
    for (const s of spawns) {
      expect(harness.state.getInstance(s.childInstanceId)?.status).toBe("failed");
    }
    // Two failure roll-ups: grandchild→child and child→root.
    const failedCompletions = harness.fakes.bus
      .ofType("ChildInstanceCompleted")
      .filter((e) => e.outcome === "failed");
    expect(failedCompletions).toHaveLength(2);
    expect(harness.state.getInstance(instanceId)?.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// §8 — cwd inheritance and override
// ---------------------------------------------------------------------------

describe("InstanceOrchestrator — child cwd (§8)", () => {
  it("inherits the parent's cwd by default", async () => {
    const A = makeRootA("B");
    harness = makeHarness([A, childB]);
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "hi" }],
      cwd: "/foo",
    });
    const spawned = await harness.waitForEvent("ChildInstanceSpawned");
    await harness.waitForStatus(instanceId, "completed");
    expect(harness.state.getInstance(spawned.childInstanceId)?.cwd).toBe("/foo");
  });

  it("honors a cwd override on the invoke step", async () => {
    const A = makeRootA("B", { invConfig: { cwd: "/bar" } });
    harness = makeHarness([A, childB]);
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "hi" }],
      cwd: "/foo",
    });
    const spawned = await harness.waitForEvent("ChildInstanceSpawned");
    await harness.waitForStatus(instanceId, "completed");
    expect(harness.state.getInstance(spawned.childInstanceId)?.cwd).toBe("/bar");
  });
});

// ---------------------------------------------------------------------------
// §7 — sub-template snapshot frozen at root start survives a mid-run republish
// ---------------------------------------------------------------------------

const snapChild = (marker: string): WorkflowTemplate =>
  buildTemplate(
    "Bsnap",
    [{ id: "body", kind: "test.const", config: { marker }, readsFrom: { in: "spec" }, writesTo: { out: "summary" } }],
    [],
    {
      id: "Bsnap",
      version: "v1",
      status: "published",
      exitSteps: ["body"],
      variables: [
        { name: "spec", kind: "Markdown", role: "input" },
        { name: "summary", kind: "Markdown", role: "output" },
      ],
    },
  );

describe("InstanceOrchestrator — sub-template snapshot (§7)", () => {
  it("uses the version frozen at root start, not a mid-run republish", async () => {
    const A = makeRootA("Bsnap", { gateBeforeInvoke: true });
    harness = makeHarness([A, snapChild("v1")]);

    const { instanceId } = await harness.startInstance({
      templateRef: refOf(A),
      seeds: [{ kind: "Markdown", content: "hi" }],
    });
    // Pause at the gate (snapshot already frozen with Bsnap@v1 = "v1").
    await harness.waitForStatus(instanceId, "awaitingHuman");

    // Republish Bsnap@v1 with a different body — the running instance must not
    // pick it up.
    await harness.fakes.templates.save(snapChild("v2"));

    const gate = harness.state
      .getInstance(instanceId)!
      .executions.find((e) => e.status === "awaitingHuman")!;
    await harness.submitHumanDecision({ instanceId, stepExecId: gate.id, by: "alice" });

    const spawned = await harness.waitForEvent("ChildInstanceSpawned");
    await harness.waitForStatus(instanceId, "completed");

    // The child ran the frozen v1 body, not the republished v2.
    const child = harness.state.getInstance(spawned.childInstanceId)!;
    const outId = child.variables.get("summary")!;
    const { content } = await harness.fakes.artifactStore.get(outId);
    expect(content).toContain("v1");
    expect(content).not.toContain("v2");
  });
});
