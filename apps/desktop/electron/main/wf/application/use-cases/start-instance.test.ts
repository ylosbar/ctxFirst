import { describe, expect, it } from "vitest";
import { makeStartInstance } from "./start-instance";
import type { TemplateVariable } from "../../domain/template";
import { buildTemplate, TEMPLATE_LINEAR } from "../../__tests__/fixtures/builders";
import { createFakeArtifactStore } from "../../__tests__/fixtures/fake-artifact-store";
import { createFakeChannelContext } from "../../__tests__/fixtures/fake-channel-context";
import { createFakeClock } from "../../__tests__/fixtures/fake-clock";
import { createFakeEventBus } from "../../__tests__/fixtures/fake-event-bus";
import { createFakeEventLog } from "../../__tests__/fixtures/fake-event-log";
import { createFakeIdGenerator } from "../../__tests__/fixtures/fake-ids";
import { createFakeTemplateRegistry } from "../../__tests__/fixtures/fake-registries";

const buildDeps = (templates = [TEMPLATE_LINEAR]) => {
  const fakes = {
    templates: createFakeTemplateRegistry(templates),
    artifactStore: createFakeArtifactStore(),
    bus: createFakeEventBus(),
    log: createFakeEventLog(),
    clock: createFakeClock(),
    ids: createFakeIdGenerator(),
    channels: createFakeChannelContext(),
  };
  return { fakes, start: makeStartInstance(fakes) };
};

describe("startInstance use-case", () => {
  it("happy path: stores seeds, appends and publishes InstanceStarted, returns id", async () => {
    const { fakes, start } = buildDeps();
    const { instanceId } = await start({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [{ kind: "Markdown", content: "hello world" }],
    });

    expect(instanceId).toMatch(/^id-/);
    expect(fakes.artifactStore.getAll()).toHaveLength(1);
    expect(fakes.artifactStore.getAll()[0].meta.kind).toBe("Markdown");
    expect(fakes.artifactStore.getAll()[0].content).toBe("hello world");

    expect(fakes.bus.ofType("InstanceStarted")).toHaveLength(1);
    expect(fakes.log.events).toHaveLength(1);

    const evt = fakes.bus.ofType("InstanceStarted")[0];
    expect(evt.instanceId).toBe(instanceId);
    expect(evt.templateId).toBe(TEMPLATE_LINEAR.id);
    expect(evt.templateVersion).toBe(TEMPLATE_LINEAR.version);
    expect(evt.seed).toHaveLength(1);
  });

  it("starts a root instance at depth 0 with no parent or templateSnapshots (sub-template-invoke.md §14)", async () => {
    const { fakes, start } = buildDeps();
    await start({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [],
    });
    const evt = fakes.bus.ofType("InstanceStarted")[0];
    // Approach A filiation: a UI-launched run is always a root.
    expect(evt.depth).toBe(0);
    expect(evt.parent).toBeUndefined();
    // No `template.invoke` exists yet (Phase A) → no transitive snapshot.
    expect(evt.templateSnapshots).toBeUndefined();
  });

  it("throws when the template ref cannot be resolved", async () => {
    const { start, fakes } = buildDeps();
    await expect(
      start({ templateRef: "unknown@v1", seeds: [] }),
    ).rejects.toThrow(/unknown template unknown@v1/);
    expect(fakes.bus.published).toHaveLength(0);
    expect(fakes.log.events).toHaveLength(0);
  });

  it("accepts empty seeds and emits an event with seed=[]", async () => {
    const { fakes, start } = buildDeps();
    await start({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [],
    });
    expect(fakes.artifactStore.getAll()).toHaveLength(0);
    expect(fakes.bus.ofType("InstanceStarted")[0].seed).toEqual([]);
  });

  it("trims the cwd and omits it when blank", async () => {
    const { fakes, start } = buildDeps();
    await start({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [],
      cwd: "   ",
    });
    expect(fakes.bus.ofType("InstanceStarted")[0].cwd).toBeUndefined();

    await start({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [],
      cwd: "  /tmp/ws  ",
    });
    expect(fakes.bus.ofType("InstanceStarted")[1].cwd).toBe("/tmp/ws");
  });

  it("pins the channelId from ChannelContext at start", async () => {
    const { fakes, start } = buildDeps();
    fakes.channels.setActive("acme");
    await start({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [],
    });
    expect(fakes.bus.ofType("InstanceStarted")[0].channelId).toBe("acme");
  });

  it("materializes variable defaults into artifacts and carries them on InstanceStarted", async () => {
    const tpl = buildTemplate(
      "with-defaults",
      [{ id: "s1", kind: "human.review" }],
      [],
      {
        variables: [
          { name: "tone", kind: "Markdown", defaultValue: "Formel" },
          { name: "noDefault", kind: "Markdown" },
        ],
      },
    );
    const { fakes, start } = buildDeps([tpl]);
    await start({ templateRef: `${tpl.id}@${tpl.version}`, seeds: [] });

    const stored = fakes.artifactStore.getAll();
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("Formel");
    expect(stored[0].meta.kind).toBe("Markdown");

    const evt = fakes.bus.ofType("InstanceStarted")[0];
    expect(evt.variableDefaults).toEqual([
      { name: "tone", artifactId: stored[0].meta.id },
    ]);
  });

  it("omits variableDefaults when no variable carries a default", async () => {
    const { fakes, start } = buildDeps();
    await start({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [],
    });
    expect(fakes.bus.ofType("InstanceStarted")[0].variableDefaults).toBeUndefined();
  });

  it("flattens workflow.call into a pinned effectiveTemplate on InstanceStarted", async () => {
    // Sub-template B: read(input spec) → write(output summary).
    const child = buildTemplate(
      "child-B",
      [
        { id: "read", kind: "claude_code.invoke", readsFrom: { in: "spec" } },
        { id: "write", kind: "claude_code.invoke", writesTo: { out: "summary" } },
      ],
      [{ from: "read", to: "write" }],
      {
        entryStep: "read",
        exitSteps: ["write"],
        variables: [
          { name: "spec", kind: "Markdown", role: "input" },
          { name: "summary", kind: "Markdown", role: "output" },
        ],
      },
    );
    // Root A: a-in → call(B) → a-out.
    const root = buildTemplate(
      "root-A",
      [
        { id: "a-in", kind: "user.input", writesTo: { out: "hostSpec" } },
        {
          id: "c",
          kind: "workflow.call",
          config: { templateId: "child-B", templateVersion: "v1" },
          readsFrom: { spec: "hostSpec" },
          writesTo: { summary: "hostResult" },
        },
        { id: "a-out", kind: "human.gate", readsFrom: { in: "hostResult" } },
      ],
      [
        { from: "a-in", to: "c" },
        { from: "c", to: "a-out" },
      ],
      {
        entryStep: "a-in",
        exitSteps: ["a-out"],
        variables: [
          { name: "hostSpec", kind: "Markdown", role: "internal" },
          { name: "hostResult", kind: "Markdown", role: "internal" },
        ],
      },
    );
    const { fakes, start } = buildDeps([root, child]);
    await start({ templateRef: `${root.id}@${root.version}`, seeds: [] });

    const evt = fakes.bus.ofType("InstanceStarted")[0];
    const eff = evt.effectiveTemplate;
    expect(eff).toBeDefined();
    // No workflow.call remains; the child steps are inlined and namespaced.
    expect(eff!.steps.some((s) => s.kind === "workflow.call")).toBe(false);
    expect(eff!.steps.map((s) => s.id).sort()).toEqual(
      ["a-in", "a-out", "c/read", "c/write"].sort(),
    );
    // Interface bindings were rewritten onto the host variables.
    expect(eff!.steps.find((s) => s.id === "c/read")?.readsFrom).toEqual({ in: "hostSpec" });
    expect(eff!.steps.find((s) => s.id === "c/write")?.writesTo).toEqual({ out: "hostResult" });
  });

  it("flattens a passThrough workflow.call by control flow only (sub-workflow-passthrough.md)", async () => {
    // Interface-less sub-template B: entry → mid → exit (no input/output var).
    const child = buildTemplate(
      "child-B",
      [
        { id: "entry", kind: "claude_code.invoke" },
        { id: "mid", kind: "claude_code.invoke" },
        { id: "exit", kind: "human.gate" },
      ],
      [
        { from: "entry", to: "mid" },
        { from: "mid", to: "exit" },
      ],
      { entryStep: "entry", exitSteps: ["exit"], variables: [] },
    );
    // Root A: seed → call(B, passThrough) → llm — no bindings.
    const root = buildTemplate(
      "root-A",
      [
        { id: "seed", kind: "user.input" },
        {
          id: "c",
          kind: "workflow.call",
          config: { templateId: "child-B", templateVersion: "v1", passThrough: true },
        },
        { id: "llm", kind: "claude_code.invoke" },
      ],
      [
        { from: "seed", to: "c" },
        { from: "c", to: "llm" },
      ],
      { entryStep: "seed", exitSteps: ["llm"], variables: [] },
    );
    const { fakes, start } = buildDeps([root, child]);
    await start({ templateRef: `${root.id}@${root.version}`, seeds: [] });

    const eff = fakes.bus.ofType("InstanceStarted")[0].effectiveTemplate;
    expect(eff).toBeDefined();
    expect(eff!.steps.some((s) => s.kind === "workflow.call")).toBe(false);
    expect(eff!.steps.map((s) => s.id).sort()).toEqual(
      ["c/entry", "c/exit", "c/mid", "llm", "seed"].sort(),
    );
    // Connected by control flow only: seed → c/entry, c/exit → llm.
    const edge = (from: string, to: string) =>
      eff!.transitions.some((t) => t.from === from && t.to === to);
    expect(edge("seed", "c/entry")).toBe(true);
    expect(edge("c/exit", "llm")).toBe(true);
    // No data ports introduced — the child had no interface variable.
    expect(eff!.steps.find((s) => s.id === "c/entry")?.readsFrom).toBeUndefined();
    expect(eff!.steps.find((s) => s.id === "c/exit")?.writesTo).toBeUndefined();
  });

  it("omits effectiveTemplate for a template without workflow.call", async () => {
    const { fakes, start } = buildDeps();
    await start({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [],
    });
    expect(fakes.bus.ofType("InstanceStarted")[0].effectiveTemplate).toBeUndefined();
  });

  it("appends to the log before publishing on the bus", async () => {
    const { fakes, start } = buildDeps();
    const order: string[] = [];
    const origAppend = fakes.log.append;
    fakes.log.append = async (e) => {
      order.push("append");
      return origAppend(e);
    };
    fakes.bus.subscribe(() => {
      order.push("publish");
    });
    await start({
      templateRef: `${TEMPLATE_LINEAR.id}@${TEMPLATE_LINEAR.version}`,
      seeds: [],
    });
    expect(order).toEqual(["append", "publish"]);
  });
});

describe("startInstance — launch inputs (variableValues)", () => {
  const launchInputTpl = (variables: ReadonlyArray<TemplateVariable>) =>
    buildTemplate("with-launch-input", [{ id: "s1", kind: "human.review" }], [], {
      variables,
    });

  it("materializes a provided launch-input value and carries it on InstanceStarted", async () => {
    const tpl = launchInputTpl([
      { name: "endpoint", kind: "Markdown", promptAtLaunch: true },
    ]);
    const { fakes, start } = buildDeps([tpl]);
    await start({
      templateRef: `${tpl.id}@${tpl.version}`,
      seeds: [],
      variableValues: [{ name: "endpoint", content: "https://api.example.com" }],
    });

    const stored = fakes.artifactStore.getAll();
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("https://api.example.com");
    expect(fakes.bus.ofType("InstanceStarted")[0].variableDefaults).toEqual([
      { name: "endpoint", artifactId: stored[0].meta.id },
    ]);
  });

  it("a launch-input value overrides the variable's defaultValue", async () => {
    const tpl = launchInputTpl([
      { name: "endpoint", kind: "Markdown", promptAtLaunch: true, defaultValue: "default-url" },
    ]);
    const { fakes, start } = buildDeps([tpl]);
    await start({
      templateRef: `${tpl.id}@${tpl.version}`,
      seeds: [],
      variableValues: [{ name: "endpoint", content: "override-url" }],
    });
    expect(fakes.artifactStore.getAll().map((s) => s.content)).toEqual(["override-url"]);
  });

  it("falls back to defaultValue when a launch input is omitted", async () => {
    const tpl = launchInputTpl([
      { name: "endpoint", kind: "Markdown", promptAtLaunch: true, defaultValue: "default-url" },
    ]);
    const { fakes, start } = buildDeps([tpl]);
    await start({ templateRef: `${tpl.id}@${tpl.version}`, seeds: [] });
    expect(fakes.artifactStore.getAll().map((s) => s.content)).toEqual(["default-url"]);
  });

  it("throws when a launch value targets an unknown variable", async () => {
    const tpl = launchInputTpl([
      { name: "endpoint", kind: "Markdown", promptAtLaunch: true, defaultValue: "x" },
    ]);
    const { fakes, start } = buildDeps([tpl]);
    await expect(
      start({
        templateRef: `${tpl.id}@${tpl.version}`,
        seeds: [],
        variableValues: [{ name: "ghost", content: "y" }],
      }),
    ).rejects.toThrow(/does not match any declared template variable/);
    expect(fakes.bus.published).toHaveLength(0);
  });

  it("throws when a launch value targets a variable that is not promptAtLaunch", async () => {
    const tpl = launchInputTpl([
      { name: "internalVar", kind: "Markdown", defaultValue: "x" },
    ]);
    const { fakes, start } = buildDeps([tpl]);
    await expect(
      start({
        templateRef: `${tpl.id}@${tpl.version}`,
        seeds: [],
        variableValues: [{ name: "internalVar", content: "y" }],
      }),
    ).rejects.toThrow(/not promptAtLaunch/);
    expect(fakes.bus.published).toHaveLength(0);
  });

  it("throws when a required launch input is provided neither a value nor a default", async () => {
    const tpl = launchInputTpl([
      { name: "endpoint", kind: "Markdown", promptAtLaunch: true },
    ]);
    const { fakes, start } = buildDeps([tpl]);
    await expect(
      start({ templateRef: `${tpl.id}@${tpl.version}`, seeds: [] }),
    ).rejects.toThrow(/required launch input "endpoint" was not provided/);
    expect(fakes.bus.published).toHaveLength(0);
  });

  it("rejects malformed launch content via the artifact-store validator", async () => {
    const tpl = launchInputTpl([
      { name: "count", kind: "Json", promptAtLaunch: true },
    ]);
    const fakes = {
      templates: createFakeTemplateRegistry([tpl]),
      artifactStore: createFakeArtifactStore({
        validate: (kind, content) => {
          if (kind === "Json") JSON.parse(content);
        },
      }),
      bus: createFakeEventBus(),
      log: createFakeEventLog(),
      clock: createFakeClock(),
      ids: createFakeIdGenerator(),
      channels: createFakeChannelContext(),
    };
    const start = makeStartInstance(fakes);
    await expect(
      start({
        templateRef: `${tpl.id}@${tpl.version}`,
        seeds: [],
        variableValues: [{ name: "count", content: "{not json" }],
      }),
    ).rejects.toThrow();
    expect(fakes.bus.published).toHaveLength(0);
  });
});
