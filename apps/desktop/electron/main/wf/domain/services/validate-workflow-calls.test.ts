import { describe, expect, it } from "vitest";
import { asStepId, asTemplateId, asTemplateVersion } from "../ids";
import type { StepDef, TemplateVariable, WorkflowTemplate } from "../template";
import { WorkflowCallError, validateWorkflowCalls } from "./validate-workflow-calls";
import type { WorkflowCallRef } from "./flatten-template";

const sid = asStepId;

const step = (id: string, kind: string, extra: Partial<StepDef> = {}): StepDef => ({
  id: sid(id),
  name: id,
  kind,
  actorRole: "Developer",
  config: {},
  humanGateRequired: false,
  ...extra,
});

const call = (id: string, childId: string, extra: Partial<StepDef> = {}): StepDef =>
  step(id, "workflow.call", { config: { templateId: childId, templateVersion: "v1" }, ...extra });

const tpl = (id: string, overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate => ({
  id: asTemplateId(id),
  name: id,
  description: "",
  version: asTemplateVersion("v1"),
  entryStep: sid("entry"),
  exitSteps: [sid("exit")],
  steps: [],
  transitions: [],
  variables: [],
  status: "published",
  ...overrides,
});

const v = (name: string, role: TemplateVariable["role"], kind = "Markdown"): TemplateVariable => ({
  name,
  kind: kind as TemplateVariable["kind"],
  role,
});

const resolverFor = (...templates: WorkflowTemplate[]) => {
  const byKey = new Map(templates.map((t) => [`${t.id}@${t.version}`, t]));
  return (ref: WorkflowCallRef): WorkflowTemplate | undefined =>
    byKey.get(`${ref.templateId}@${ref.templateVersion}`);
};

/** A minimal, valid invocable sub-template B: read(input seed) → write(output summary). */
const childB = tpl("B", {
  entryStep: sid("read"),
  exitSteps: [sid("write")],
  steps: [
    step("read", "claude_code.invoke", { readsFrom: { in: "seed" } }),
    step("write", "claude_code.invoke", { writesTo: { out: "summary" } }),
  ],
  transitions: [{ from: sid("read"), to: sid("write"), isLoop: false }],
  variables: [v("seed", "input"), v("summary", "output")],
});

/** A host A wiring B's interface to its own variables. */
const hostWith = (callStep: StepDef, overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate =>
  tpl("A", {
    entryStep: sid("a-in"),
    exitSteps: [sid("a-out")],
    steps: [
      step("a-in", "user.input", { writesTo: { out: "spec" } }),
      callStep,
      step("a-out", "claude_code.invoke", { readsFrom: { in: "result" } }),
    ],
    transitions: [
      { from: sid("a-in"), to: sid("c"), isLoop: false },
      { from: sid("c"), to: sid("a-out"), isLoop: false },
    ],
    variables: [v("spec", "internal"), v("result", "internal")],
    ...overrides,
  });

describe("validateWorkflowCalls — happy path", () => {
  it("accepts a fully-bound, published, invocable call", () => {
    const root = hostWith(call("c", "B", { readsFrom: { seed: "spec" }, writesTo: { summary: "result" } }));
    expect(() => validateWorkflowCalls(root, resolverFor(childB))).not.toThrow();
  });

  it("is a no-op for a template with no workflow.call", () => {
    const root = tpl("A", {
      entryStep: sid("s"),
      exitSteps: [sid("s")],
      steps: [step("s", "human.gate")],
    });
    expect(() => validateWorkflowCalls(root, resolverFor())).not.toThrow();
  });
});

describe("validateWorkflowCalls — rule 1 (literal ref + published)", () => {
  it("rejects a missing literal ref", () => {
    const root = hostWith(step("c", "workflow.call", { config: {} }));
    expect(() => validateWorkflowCalls(root, resolverFor(childB))).toThrow(WorkflowCallError);
  });

  it("rejects an unresolved sub-template", () => {
    const root = hostWith(call("c", "MISSING"));
    expect(() => validateWorkflowCalls(root, resolverFor(childB))).toThrow(/could not be resolved/);
  });

  it("rejects a draft sub-template", () => {
    const draft = tpl("B", { ...childB, status: "draft" });
    const root = hostWith(call("c", "B", { readsFrom: { seed: "spec" }, writesTo: { summary: "result" } }));
    expect(() => validateWorkflowCalls(root, resolverFor(draft))).toThrow(/not published/);
  });
});

describe("validateWorkflowCalls — rule 2 (invocable)", () => {
  it("rejects a sub-template with no interface variables", () => {
    const opaque = tpl("B", {
      entryStep: sid("z"),
      exitSteps: [sid("z")],
      steps: [step("z", "human.gate")],
      variables: [v("tmp", "internal")],
    });
    const root = hostWith(call("c", "B"));
    expect(() => validateWorkflowCalls(root, resolverFor(opaque))).toThrow(/not invocable/);
  });
});

describe("validateWorkflowCalls — passThrough (sub-workflow-passthrough.md)", () => {
  // An interface-less sub-template: pure side-effect sub-routine.
  const opaque = tpl("B", {
    entryStep: sid("z"),
    exitSteps: [sid("z")],
    steps: [step("z", "human.gate")],
    variables: [v("tmp", "internal")],
  });

  /** A `workflow.call` to `childId@v1` tagged `passThrough: true`. */
  const ptCall = (id: string, childId: string, extra: Partial<StepDef> = {}): StepDef =>
    step(id, "workflow.call", {
      config: { templateId: childId, templateVersion: "v1", passThrough: true },
      ...extra,
    });

  // Host wiring a control-flow-only call (no bindings): a-in → c → a-out.
  const hostPassThrough = (callStep: StepDef): WorkflowTemplate =>
    tpl("A", {
      entryStep: sid("a-in"),
      exitSteps: [sid("a-out")],
      steps: [step("a-in", "user.input"), callStep, step("a-out", "human.gate")],
      transitions: [
        { from: sid("a-in"), to: sid("c"), isLoop: false },
        { from: sid("c"), to: sid("a-out"), isLoop: false },
      ],
    });

  it("accepts passThrough over an interface-less sub-template", () => {
    const root = hostPassThrough(ptCall("c", "B"));
    expect(() => validateWorkflowCalls(root, resolverFor(opaque))).not.toThrow();
  });

  it("keeps the historic error (citing passThrough) when the flag is absent", () => {
    const root = hostPassThrough(call("c", "B"));
    expect(() => validateWorkflowCalls(root, resolverFor(opaque))).toThrow(/set passThrough: true/);
  });

  it("rejects passThrough over a sub-template that exposes an interface", () => {
    const root = hostPassThrough(ptCall("c", "B"));
    expect(() => validateWorkflowCalls(root, resolverFor(childB))).toThrow(/marked passThrough but/);
  });
});

describe("validateWorkflowCalls — rule 3 (exhaustive mapping)", () => {
  it("rejects an unbound input", () => {
    const root = hostWith(call("c", "B", { writesTo: { summary: "result" } }));
    expect(() => validateWorkflowCalls(root, resolverFor(childB))).toThrow(/must bind input "seed"/);
  });

  it("rejects an output consumed downstream but not bound", () => {
    const root = hostWith(
      call("c", "B", { readsFrom: { seed: "spec" } }),
      {
        transitions: [
          { from: sid("a-in"), to: sid("c"), isLoop: false },
          { from: sid("c"), fromPort: "summary", to: sid("a-out"), isLoop: false },
        ],
      },
    );
    expect(() => validateWorkflowCalls(root, resolverFor(childB))).toThrow(/output "summary".*consumed downstream/);
  });

  it("allows an unbound output that is not consumed", () => {
    const root = hostWith(call("c", "B", { readsFrom: { seed: "spec" } }), {
      // a-out reads `result`, which nothing produces now — but workflow.call
      // validation only cares about its own bindings; rule 7 (validateTemplate)
      // catches the dangling read, so we test rule 3 in isolation here.
      steps: [
        step("a-in", "user.input", { writesTo: { out: "spec" } }),
        call("c", "B", { readsFrom: { seed: "spec" } }),
        step("a-out", "human.gate"),
      ],
      transitions: [
        { from: sid("a-in"), to: sid("c"), isLoop: false },
        { from: sid("c"), to: sid("a-out"), isLoop: false },
      ],
      variables: [v("spec", "internal")],
    });
    expect(() => validateWorkflowCalls(root, resolverFor(childB))).not.toThrow();
  });

  it("rejects binding to an undeclared host variable", () => {
    const root = hostWith(call("c", "B", { readsFrom: { seed: "nope" }, writesTo: { summary: "result" } }));
    expect(() => validateWorkflowCalls(root, resolverFor(childB))).toThrow(/not declared on A/);
  });
});

describe("validateWorkflowCalls — rule 4 (kind compat)", () => {
  it("rejects a kind-incompatible input binding", () => {
    const root = hostWith(call("c", "B", { readsFrom: { seed: "spec" }, writesTo: { summary: "result" } }), {
      steps: [
        step("a-in", "user.input", { writesTo: { out: "spec" } }),
        call("c", "B", { readsFrom: { seed: "spec" }, writesTo: { summary: "result" } }),
        step("a-out", "claude_code.invoke", { readsFrom: { in: "result" } }),
      ],
      variables: [v("spec", "internal", "DiffArtifact"), v("result", "internal")],
    });
    expect(() => validateWorkflowCalls(root, resolverFor(childB))).toThrow(/expects Markdown.*DiffArtifact/);
  });
});

describe("validateWorkflowCalls — rules 5 & 6 (cycle + depth)", () => {
  it("rejects a reference cycle citing the chain", () => {
    const a = tpl("A", {
      entryStep: sid("ca"),
      exitSteps: [sid("ca")],
      steps: [call("ca", "B")],
      variables: [v("x", "input")],
    });
    const b = tpl("B", {
      entryStep: sid("cb"),
      exitSteps: [sid("cb")],
      steps: [call("cb", "A")],
      variables: [v("x", "input")],
    });
    // bindings are satisfied trivially (no consumed outputs); cycle is the trigger
    const aWired = tpl("A", { ...a, steps: [call("ca", "B", { readsFrom: { x: "x" } })], variables: [v("x", "internal")] });
    const bWired = tpl("B", { ...b, steps: [call("cb", "A", { readsFrom: { x: "x" } })], variables: [v("x", "internal")] });
    expect(() => validateWorkflowCalls(aWired, resolverFor(aWired, bWired))).toThrow(WorkflowCallError);
  });

  it("rejects exceeding the depth bound", () => {
    const leaf = tpl("leaf", {
      entryStep: sid("z"),
      exitSteps: [sid("z")],
      steps: [step("z", "human.gate")],
      variables: [v("x", "input")],
    });
    // chain of wrappers, each invocable + binding its single input
    const chain: WorkflowTemplate[] = [leaf];
    for (let i = 1; i <= 9; i++) {
      const childId = i === 1 ? "leaf" : `w${i - 1}`;
      chain.push(
        tpl(`w${i}`, {
          entryStep: sid("c"),
          exitSteps: [sid("c")],
          steps: [call("c", childId, { readsFrom: { x: "x" } })],
          // `input` so each wrapper is itself invocable by its parent (rule 2).
          variables: [v("x", "input")],
        }),
      );
    }
    const root = chain[chain.length - 1];
    expect(() => validateWorkflowCalls(root, resolverFor(...chain), { maxDepth: 3 })).toThrow(
      /MAX_EXPANSION_DEPTH/,
    );
  });
});

describe("validateWorkflowCalls — rule 7 (scope violation §9)", () => {
  const looping = tpl("B", {
    entryStep: sid("f"),
    exitSteps: [sid("col")],
    steps: [
      step("f", "loop.foreach"),
      step("body", "claude_code.invoke"),
      step("col", "loop.collect"),
    ],
    transitions: [
      { from: sid("f"), to: sid("body"), isLoop: false },
      { from: sid("body"), to: sid("col"), isLoop: false },
    ],
    variables: [v("seed", "input")],
  });

  it("reports the offending workflow.call when placed inside a host foreach", () => {
    const root = tpl("A", {
      entryStep: sid("hf"),
      exitSteps: [sid("hcol")],
      steps: [
        step("hf", "loop.foreach"),
        call("c", "B", { readsFrom: { seed: "spec" } }),
        step("hcol", "loop.collect"),
      ],
      transitions: [
        { from: sid("hf"), to: sid("c"), isLoop: false },
        { from: sid("c"), to: sid("hcol"), isLoop: false },
      ],
      variables: [v("spec", "internal")],
    });
    expect(() => validateWorkflowCalls(root, resolverFor(looping))).toThrow(/workflow.call "c"/);
  });
});

describe("validateWorkflowCalls — Gate 2 (required launch input, launch-input-variables.md)", () => {
  it("rejects calling a child that exposes a required launch input (promptAtLaunch, no default, internal)", () => {
    const childWithRequired: WorkflowTemplate = {
      ...childB,
      variables: [
        ...childB.variables,
        { name: "ticketId", kind: "Markdown", promptAtLaunch: true },
      ],
    };
    const root = hostWith(call("c", "B", { readsFrom: { seed: "spec" }, writesTo: { summary: "result" } }));
    expect(() => validateWorkflowCalls(root, resolverFor(childWithRequired))).toThrow(WorkflowCallError);
    expect(() => validateWorkflowCalls(root, resolverFor(childWithRequired))).toThrow(/required launch input/);
  });

  it("accepts when the launch input carries a defaultValue (seeded even as a child)", () => {
    const childWithDefault: WorkflowTemplate = {
      ...childB,
      variables: [
        ...childB.variables,
        {
          name: "ticketId",
          kind: "Markdown",
          promptAtLaunch: true,
          defaultValue: "ABC-1",
        },
      ],
    };
    const root = hostWith(call("c", "B", { readsFrom: { seed: "spec" }, writesTo: { summary: "result" } }));
    expect(() => validateWorkflowCalls(root, resolverFor(childWithDefault))).not.toThrow();
  });

  it("accepts when the launch input is also role:input (seeded by the parent via readsFrom)", () => {
    const childRoleInput: WorkflowTemplate = {
      ...childB,
      steps: [
        step("read", "claude_code.invoke", { readsFrom: { in: "seed" } }),
        step("write", "claude_code.invoke", {
          readsFrom: { in: "ticketId" },
          writesTo: { out: "summary" },
        }),
      ],
      variables: [
        v("seed", "input"),
        v("summary", "output"),
        { name: "ticketId", kind: "Markdown", role: "input", promptAtLaunch: true },
      ],
    };
    const root = tpl("A", {
      entryStep: sid("a-in"),
      exitSteps: [sid("a-out")],
      steps: [
        step("a-in", "user.input", { writesTo: { out: "spec" } }),
        call("c", "B", { readsFrom: { seed: "spec", ticketId: "tkt" }, writesTo: { summary: "result" } }),
        step("a-out", "claude_code.invoke", { readsFrom: { in: "result" } }),
      ],
      transitions: [
        { from: sid("a-in"), to: sid("c"), isLoop: false },
        { from: sid("c"), to: sid("a-out"), isLoop: false },
      ],
      variables: [v("spec", "internal"), v("result", "internal"), v("tkt", "internal")],
    });
    expect(() => validateWorkflowCalls(root, resolverFor(childRoleInput))).not.toThrow();
  });
});
