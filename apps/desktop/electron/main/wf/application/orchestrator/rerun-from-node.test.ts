import { afterEach, describe, expect, it } from "vitest";
import {
  createOrchestratorHarness,
  type OrchestratorHarness,
} from "../../__tests__/fixtures/orchestrator-harness";
import { asStepId, buildTemplate } from "../../__tests__/fixtures/builders";
import { putArtifactPayload } from "../artifact-io";
import { project } from "../../domain/projection";
import type { StepExecId } from "../../domain/ids";
import type { RunContext, StepRunner } from "../step-runner";

let harness: OrchestratorHarness | null = null;

afterEach(() => {
  harness?.stop();
  harness = null;
});

const refOf = (tpl: { id: string; version: string }) => `${tpl.id}@${tpl.version}`;

/**
 * Wait until `pred()` holds. Needed for replays: the instance is already
 * `completed` from the first run, so `waitForStatus("completed")` returns
 * instantly — we must wait for the *replay* to both supersede the target and
 * re-complete.
 */
const waitUntil = (pred: () => boolean, timeoutMs = 2000): Promise<void> =>
  new Promise((resolve, reject) => {
    if (pred()) return resolve();
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("[test] waitUntil timed out"));
    }, timeoutMs);
    const unsub = harness!.fakes.bus.subscribe(() => {
      if (pred()) {
        clearTimeout(timer);
        unsub();
        resolve();
      }
    });
  });

/**
 * Resolves once the replay from `targetExecId` has fully run: the run is
 * `completed` AND the target step has a *fresh* validated exec (id ≠ the
 * superseded one). Superseding alone leaves the instance `completed`, so we
 * can't key on supersede + completed — we must observe the re-execution.
 */
const waitForReplay = (instanceId: string, targetExecId: string): Promise<void> => {
  const pre = harness!.state.getInstance(instanceId as never)!;
  const targetStepId = pre.executions.find((e) => e.id === targetExecId)!.stepId;
  return waitUntil(() => {
    const i = harness!.state.getInstance(instanceId as never);
    if (!i || i.status !== "completed") return false;
    if (i.executions.find((e) => e.id === targetExecId)?.status !== "superseded")
      return false;
    return i.executions.some(
      (e) => e.stepId === targetStepId && e.id !== targetExecId && e.status === "validated",
    );
  });
};

/**
 * Markdown step runner whose output body is `${stepId}#${runCount}` — so every
 * invocation produces a *distinct, traceable* artifact. Records each run's
 * RunContext so a test can assert which upstream output a step actually read.
 * One declared input port `in` (list, optional) absorbs any number of incoming
 * edges; downstream steps echo nothing from inputs (only the counter), so the
 * body uniquely identifies the producing run.
 */
const makeSeqRunner = (
  counter: { n: number },
  captures: RunContext[],
): StepRunner => ({
  kind: "test.seq",
  resolveSpec: () => ({
    title: "seq",
    inputs: [{ name: "in", kinds: ["Markdown"], optional: true, isList: true }],
    outputs: [{ name: "out", kind: "Markdown" }],
  }),
  async run(ctx) {
    captures.push(ctx);
    counter.n += 1;
    const cfgTag =
      typeof ctx.step.config["tag"] === "string"
        ? `:${ctx.step.config["tag"] as string}`
        : "";
    const artifact = await putArtifactPayload(ctx.deps.artifactStore, "Markdown", {
      format: "markdown",
      body: `${ctx.stepId}#${counter.n}${cfgTag}`,
    });
    return { kind: "produced", artifact };
  },
});

const bodyOf = (input: { content: string }): string =>
  (JSON.parse(input.content) as { body: string }).body;

// ---------------------------------------------------------------------------
// Linear chain — the golden path
// ---------------------------------------------------------------------------

describe("rerunFromNode — linear chain", () => {
  it("re-runs B and C, supersedes their old execs, leaves A intact", async () => {
    const counter = { n: 0 };
    const captures: RunContext[] = [];
    const template = buildTemplate(
      "linear-rerun",
      [
        { id: "A", kind: "user.input", humanGateRequired: false, config: { outputKind: "Markdown" } },
        { id: "B", kind: "test.seq", humanGateRequired: false },
        { id: "C", kind: "test.seq", humanGateRequired: false },
      ],
      [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ],
      { exitSteps: ["C"] },
    );

    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [makeSeqRunner(counter, captures)],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const before = harness.state.getInstance(instanceId)!;
    const bExec = before.executions.find((e) => e.stepId === asStepId("B"))!;
    const aExecId = before.executions.find((e) => e.stepId === asStepId("A"))!.id;
    expect(bExec.status).toBe("validated");

    // Re-run from B.
    await harness.rerunFromNode({ instanceId, stepExecId: bExec.id });
    await waitForReplay(instanceId, bExec.id);

    const after = harness.state.getInstance(instanceId)!;
    const bExecs = after.executions.filter((e) => e.stepId === asStepId("B"));
    const cExecs = after.executions.filter((e) => e.stepId === asStepId("C"));
    const aExecs = after.executions.filter((e) => e.stepId === asStepId("A"));

    // Old B/C execs superseded; one fresh validated exec each.
    expect(bExecs.find((e) => e.id === bExec.id)!.status).toBe("superseded");
    expect(bExecs.filter((e) => e.status === "validated")).toHaveLength(1);
    expect(cExecs.filter((e) => e.status === "validated")).toHaveLength(1);
    expect(cExecs.filter((e) => e.status === "superseded")).toHaveLength(1);

    // A is untouched: still exactly one exec, same id, still validated.
    expect(aExecs).toHaveLength(1);
    expect(aExecs[0].id).toBe(aExecId);
    expect(aExecs[0].status).toBe("validated");

    // The fresh C read the fresh B output (the latest, not the superseded one).
    const newB = bExecs.find((e) => e.status === "validated")!;
    const cRuns = captures.filter((c) => c.stepId === asStepId("C"));
    const lastCRun = cRuns[cRuns.length - 1];
    const cReadBody = bodyOf(lastCRun.inputs[0]);
    const newBOutputId = [...newB.outputs.values()][0];
    const newBContent = await harness.fakes.artifactStore.get(newBOutputId);
    expect(cReadBody).toBe(bodyOf({ content: newBContent.content }));

    // Instance went running again at the replay then back to completed.
    expect(harness.fakes.bus.ofType("StepSuperseded").length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Convergence — the critical case (asymmetric "kite")
// ---------------------------------------------------------------------------
//
//   X ─► C ───────────► Y         (short path to one parent of Y)
//   └──► A ─► B ───────► Y         (long path to the other parent)
//
// Re-run from X. C re-validates first; without the transitive supersede, Y's
// other parent B is still on its OLD validated exec → Y would start early and
// read a stale B. The supersede ranges B's old exec `unresolved`, so Y waits
// for the fresh B and reads it.

describe("rerunFromNode — convergence (no stale read)", () => {
  it("a convergent step waits for ALL parents to re-validate and reads fresh outputs", async () => {
    const counter = { n: 0 };
    const captures: RunContext[] = [];
    const template = buildTemplate(
      "kite-rerun",
      [
        { id: "X", kind: "user.input", humanGateRequired: false, config: { outputKind: "Markdown" } },
        { id: "C", kind: "test.seq", humanGateRequired: false },
        { id: "A", kind: "test.seq", humanGateRequired: false },
        { id: "B", kind: "test.seq", humanGateRequired: false },
        { id: "Y", kind: "test.seq", humanGateRequired: false },
      ],
      [
        { from: "X", to: "C" },
        { from: "X", to: "A" },
        { from: "A", to: "B" },
        { from: "C", to: "Y", toPort: "in", order: 0 },
        { from: "B", to: "Y", toPort: "in", order: 1 },
      ],
      { exitSteps: ["Y"] },
    );

    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [makeSeqRunner(counter, captures)],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const before = harness.state.getInstance(instanceId)!;
    const xExec = before.executions.find((e) => e.stepId === asStepId("X"))!;

    captures.length = 0; // only look at runs from the replay onward
    await harness.rerunFromNode({ instanceId, stepExecId: xExec.id });
    await waitForReplay(instanceId, xExec.id);

    const after = harness.state.getInstance(instanceId)!;
    const newY = [...after.executions]
      .reverse()
      .find((e) => e.stepId === asStepId("Y") && e.status === "validated")!;
    const newB = [...after.executions]
      .reverse()
      .find((e) => e.stepId === asStepId("B") && e.status === "validated")!;
    const newC = [...after.executions]
      .reverse()
      .find((e) => e.stepId === asStepId("C") && e.status === "validated")!;

    // Y ran exactly once after the replay (started only once both parents were
    // fresh — no early start on stale B).
    const yRuns = captures.filter((c) => c.stepId === asStepId("Y"));
    expect(yRuns).toHaveLength(1);

    // The (single) Y run read BOTH fresh parents — never an old B/C output.
    const yRun = yRuns[0];
    const readBodies = yRun.inputs.map((i) => bodyOf(i)).sort();
    const newBBody = bodyOf({
      content: (await harness.fakes.artifactStore.get([...newB.outputs.values()][0])).content,
    });
    const newCBody = bodyOf({
      content: (await harness.fakes.artifactStore.get([...newC.outputs.values()][0])).content,
    });
    expect(readBodies).toEqual([newBBody, newCBody].sort());
    expect(newY.status).toBe("validated");
  });
});

// ---------------------------------------------------------------------------
// Config override (Phase 2 of retry-from-failed, reused)
// ---------------------------------------------------------------------------

describe("rerunFromNode — config override", () => {
  it("applies a one-off config patch to the target exec without touching the template", async () => {
    const counter = { n: 0 };
    const captures: RunContext[] = [];
    const template = buildTemplate(
      "override-rerun",
      [
        { id: "A", kind: "user.input", humanGateRequired: false, config: { outputKind: "Markdown" } },
        { id: "B", kind: "test.seq", humanGateRequired: false, config: { tag: "orig" } },
      ],
      [{ from: "A", to: "B" }],
      { exitSteps: ["B"] },
    );

    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [makeSeqRunner(counter, captures)],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const before = harness.state.getInstance(instanceId)!;
    const bExec = before.executions.find((e) => e.stepId === asStepId("B"))!;

    captures.length = 0;
    await harness.rerunFromNode({
      instanceId,
      stepExecId: bExec.id,
      configOverride: { tag: "patched" },
    });
    await waitForReplay(instanceId, bExec.id);

    // The B runner saw the patched config.
    const bRun = captures.find((c) => c.stepId === asStepId("B"))!;
    expect(bRun.step.config["tag"]).toBe("patched");

    const after = harness.state.getInstance(instanceId)!;
    const newB = [...after.executions]
      .reverse()
      .find((e) => e.stepId === asStepId("B") && e.status === "validated")!;
    expect(newB.appliedConfigOverride).toEqual({ tag: "patched" });

    // The template snapshot is unchanged (still `orig`).
    const tpl = await harness.fakes.templates.resolve(
      template.id,
      template.version,
    );
    expect(tpl.steps.find((s) => s.id === asStepId("B"))!.config["tag"]).toBe("orig");

    // The StepStarted event carries the override for deterministic replay.
    const started = harness.fakes.bus
      .ofType("StepStarted")
      .filter((e) => e.stepId === asStepId("B"));
    expect(started[started.length - 1].configOverride).toEqual({ tag: "patched" });
  });
});

// ---------------------------------------------------------------------------
// Guard-rails + replay determinism
// ---------------------------------------------------------------------------

describe("rerunFromNode — guard-rails", () => {
  const linear = () =>
    buildTemplate(
      "guard-rerun",
      [
        { id: "A", kind: "user.input", humanGateRequired: false, config: { outputKind: "Markdown" } },
        { id: "B", kind: "test.seq", humanGateRequired: false },
      ],
      [{ from: "A", to: "B" }],
      { exitSteps: ["B"] },
    );

  it("rejects an unknown instance / exec", async () => {
    harness = createOrchestratorHarness({
      templates: [linear()],
      extraRunners: [makeSeqRunner({ n: 0 }, [])],
    });
    await expect(
      harness.rerunFromNode({
        instanceId: "nope" as never,
        stepExecId: "x" as StepExecId,
      }),
    ).rejects.toThrow(/unknown instance/);
  });

  it("rejects a non-replayable status (no event emitted)", async () => {
    const tpl = linear();
    harness = createOrchestratorHarness({
      templates: [tpl],
      extraRunners: [makeSeqRunner({ n: 0 }, [])],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(tpl),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");

    // First rerun, then immediately target the now-superseded old exec.
    const inst = harness.state.getInstance(instanceId)!;
    const bExec = inst.executions.find((e) => e.stepId === asStepId("B"))!;
    await harness.rerunFromNode({ instanceId, stepExecId: bExec.id });
    await waitForReplay(instanceId, bExec.id);

    const before = harness.fakes.bus.published.length;
    await expect(
      harness.rerunFromNode({ instanceId, stepExecId: bExec.id }),
    ).rejects.toThrow(/not replayable/);
    expect(harness.fakes.bus.published.length).toBe(before);
  });

  it("rejects re-running a loop.foreach node itself", async () => {
    const tpl = buildTemplate(
      "foreach-guard",
      [
        { id: "A", kind: "user.input", humanGateRequired: false, config: { outputKind: "MarkdownList" } },
        { id: "fe", kind: "loop.foreach", humanGateRequired: false, config: { itemKind: "Markdown" } },
        { id: "body", kind: "test.seq", humanGateRequired: false },
        { id: "col", kind: "loop.collect", humanGateRequired: false, config: { itemKind: "Markdown" } },
      ],
      [
        { from: "A", to: "fe" },
        { from: "fe", to: "body" },
        { from: "body", to: "col" },
      ],
      { exitSteps: ["col"] },
    );
    harness = createOrchestratorHarness({
      templates: [tpl],
      extraRunners: [makeSeqRunner({ n: 0 }, [])],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(tpl),
      seeds: [{ kind: "MarkdownList", content: JSON.stringify({ bodies: ["a", "b"] }) }],
    });
    await harness.waitForStatus(instanceId, "completed");

    const inst = harness.state.getInstance(instanceId)!;
    const feExec = inst.executions.find((e) => e.stepId === asStepId("fe"))!;
    await expect(
      harness.rerunFromNode({ instanceId, stepExecId: feExec.id }),
    ).rejects.toThrow(/loop\.foreach/);
  });
});

describe("rerunFromNode — replay determinism", () => {
  it("rebuilding the projection from the event log reproduces supersede → re-run", async () => {
    const template = buildTemplate(
      "replay-rerun",
      [
        { id: "A", kind: "user.input", humanGateRequired: false, config: { outputKind: "Markdown" } },
        { id: "B", kind: "test.seq", humanGateRequired: false },
        { id: "C", kind: "test.seq", humanGateRequired: false },
      ],
      [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ],
      { exitSteps: ["C"] },
    );
    harness = createOrchestratorHarness({
      templates: [template],
      extraRunners: [makeSeqRunner({ n: 0 }, [])],
    });
    const { instanceId } = await harness.startInstance({
      templateRef: refOf(template),
      seeds: [{ kind: "Markdown", content: "seed" }],
    });
    await harness.waitForStatus(instanceId, "completed");
    const bExec = harness.state
      .getInstance(instanceId)!
      .executions.find((e) => e.stepId === asStepId("B"))!;
    await harness.rerunFromNode({
      instanceId,
      stepExecId: bExec.id,
      configOverride: { tag: "z" },
    });
    await waitForReplay(instanceId, bExec.id);

    const live = harness.state.getInstance(instanceId)!;
    const replayed = project(
      harness.fakes.log.events.filter((e) => "instanceId" in e && e.instanceId === instanceId),
    )!;

    const norm = (s: typeof live) =>
      [...s.executions]
        .map((e) => `${e.stepId}:${e.status}:${e.appliedConfigOverride?.["tag"] ?? "-"}`)
        .sort();
    expect(norm(replayed)).toEqual(norm(live));
    expect(replayed.status).toBe("completed");
  });
});
