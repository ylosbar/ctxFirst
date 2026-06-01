import { describe, expect, it } from "vitest";
import { asStepId, asTemplateId, asTemplateVersion, type TemplateId } from "../ids";
import { validateTemplate, type StepDef, type WorkflowTemplate } from "../template";
import { inferIterationScopes } from "./iteration-scopes";
import {
  FlattenError,
  flattenTemplate,
  hasWorkflowCall,
  type WorkflowCallRef,
} from "./flatten-template";

const sid = asStepId;

const step = (
  id: string,
  kind: string,
  extra: Partial<StepDef> = {},
): StepDef => ({
  id: sid(id),
  name: id,
  kind,
  actorRole: "Developer",
  config: {},
  humanGateRequired: false,
  ...extra,
});

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

/** A `workflow.call` step referencing `childId@v1`. */
const call = (
  id: string,
  childId: string,
  extra: Partial<StepDef> = {},
): StepDef =>
  step(id, "workflow.call", {
    config: { templateId: childId, templateVersion: "v1" },
    ...extra,
  });

/** Builds a synchronous resolver over a fixed set of templates (by id, @v1). */
const resolverFor = (...templates: WorkflowTemplate[]) => {
  const byKey = new Map(templates.map((t) => [`${t.id}@${t.version}`, t]));
  return (ref: WorkflowCallRef): WorkflowTemplate => {
    const t = byKey.get(`${ref.templateId}@${ref.templateVersion}`);
    if (!t) throw new Error(`unresolved ${ref.templateId}@${ref.templateVersion}`);
    return t;
  };
};

const noResolve = (): WorkflowTemplate => {
  throw new Error("resolve should not be called");
};

describe("flattenTemplate — identity", () => {
  it("returns root unchanged when it has no workflow.call", () => {
    const root = tpl("A", {
      steps: [step("entry", "user.input"), step("exit", "human.gate")],
      transitions: [{ from: sid("entry"), to: sid("exit"), isLoop: false }],
    });
    const eff = flattenTemplate(root, noResolve);
    expect(eff).toBe(root);
    expect(hasWorkflowCall(eff)).toBe(false);
  });
});

describe("flattenTemplate — single linear call", () => {
  // child B: cin → llm → cout
  const child = tpl("B", {
    entryStep: sid("cin"),
    exitSteps: [sid("cout")],
    steps: [step("cin", "user.input"), step("llm", "claude_code.invoke"), step("cout", "human.gate")],
    transitions: [
      { from: sid("cin"), to: sid("llm"), isLoop: false },
      { from: sid("llm"), to: sid("cout"), isLoop: false },
    ],
  });
  // root A: a-in → c(B) → a-out
  const root = tpl("A", {
    entryStep: sid("a-in"),
    exitSteps: [sid("a-out")],
    steps: [step("a-in", "user.input"), call("c", "B"), step("a-out", "human.gate")],
    transitions: [
      { from: sid("a-in"), to: sid("c"), isLoop: false },
      { from: sid("c"), to: sid("a-out"), isLoop: false },
    ],
  });

  it("inlines the 3 child steps namespaced under the call id, no workflow.call left", () => {
    const eff = flattenTemplate(root, resolverFor(child));
    expect(hasWorkflowCall(eff)).toBe(false);
    const ids = eff.steps.map((s) => s.id).sort();
    expect(ids).toEqual(["a-in", "a-out", "c/cin", "c/cout", "c/llm"].sort());
  });

  it("rewires control flow a-in → c/cin … c/cout → a-out", () => {
    const eff = flattenTemplate(root, resolverFor(child));
    const edge = (from: string, to: string) =>
      eff.transitions.some((t) => t.from === sid(from) && t.to === sid(to));
    expect(edge("a-in", "c/cin")).toBe(true);
    expect(edge("c/cin", "c/llm")).toBe(true);
    expect(edge("c/llm", "c/cout")).toBe(true);
    expect(edge("c/cout", "a-out")).toBe(true);
    // the original edges into/out of the removed call are gone
    expect(eff.transitions.some((t) => t.from === sid("c") || t.to === sid("c"))).toBe(false);
  });

  it("output passes validateTemplate", () => {
    const eff = flattenTemplate(root, resolverFor(child));
    expect(() => validateTemplate(eff)).not.toThrow();
  });
});

describe("flattenTemplate — multiple calls of the same template", () => {
  const child = tpl("B", {
    entryStep: sid("cin"),
    exitSteps: [sid("cout")],
    steps: [step("cin", "user.input"), step("cout", "human.gate")],
    transitions: [{ from: sid("cin"), to: sid("cout"), isLoop: false }],
    variables: [{ name: "tmp", kind: "Markdown", role: "internal" }],
  });
  const root = tpl("A", {
    entryStep: sid("c1"),
    exitSteps: [sid("c2")],
    steps: [call("c1", "B"), call("c2", "B")],
    transitions: [{ from: sid("c1"), to: sid("c2"), isLoop: false }],
  });

  it("produces disjoint c1/* and c2/* ids with no collision", () => {
    const eff = flattenTemplate(root, resolverFor(child));
    const ids = eff.steps.map((s) => s.id);
    expect(ids).toContain(sid("c1/cin"));
    expect(ids).toContain(sid("c2/cin"));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("namespaces internal variables disjointly", () => {
    const eff = flattenTemplate(root, resolverFor(child));
    const names = eff.variables.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => n.includes("tmp")).length).toBe(2);
  });

  it("entry/exit follow the replaced calls", () => {
    const eff = flattenTemplate(root, resolverFor(child));
    expect(eff.entryStep).toBe(sid("c1/cin"));
    expect(eff.exitSteps).toEqual([sid("c2/cout")]);
    expect(() => validateTemplate(eff)).not.toThrow();
  });
});

describe("flattenTemplate — nesting (A→B→C)", () => {
  const c = tpl("C", {
    entryStep: sid("z"),
    exitSteps: [sid("z")],
    steps: [step("z", "human.gate")],
  });
  const b = tpl("B", {
    entryStep: sid("cc"),
    exitSteps: [sid("cc")],
    steps: [call("cc", "C")],
  });
  const a = tpl("A", {
    entryStep: sid("cb"),
    exitSteps: [sid("cb")],
    steps: [call("cb", "B")],
  });

  it("accumulates the prefix to cb/cc/z, depth 2", () => {
    const eff = flattenTemplate(a, resolverFor(b, c));
    expect(hasWorkflowCall(eff)).toBe(false);
    expect(eff.steps.map((s) => s.id)).toEqual([sid("cb/cc/z")]);
    expect(eff.entryStep).toBe(sid("cb/cc/z"));
    expect(() => validateTemplate(eff)).not.toThrow();
  });
});

describe("flattenTemplate — interface binding", () => {
  // child B reads input `seed`, writes output `summary`.
  const child = tpl("B", {
    entryStep: sid("read"),
    exitSteps: [sid("write")],
    steps: [
      step("read", "claude_code.invoke", { readsFrom: { in: "seed" } }),
      step("write", "claude_code.invoke", { writesTo: { out: "summary" } }),
    ],
    transitions: [{ from: sid("read"), to: sid("write"), isLoop: false }],
    variables: [
      { name: "seed", kind: "Markdown", role: "input" },
      { name: "summary", kind: "Markdown", role: "output" },
    ],
  });
  const root = tpl("A", {
    entryStep: sid("a-in"),
    exitSteps: [sid("a-out")],
    steps: [
      step("a-in", "user.input", { writesTo: { out: "spec" } }),
      call("c", "B", { readsFrom: { seed: "spec" }, writesTo: { summary: "result" } }),
      step("a-out", "claude_code.invoke", { readsFrom: { in: "result" } }),
    ],
    transitions: [
      { from: sid("a-in"), to: sid("c"), isLoop: false },
      { from: sid("c"), to: sid("a-out"), isLoop: false },
    ],
    variables: [
      { name: "spec", kind: "Markdown", role: "internal" },
      { name: "result", kind: "Markdown", role: "internal" },
    ],
  });

  it("redirects child input readsFrom onto the bound host variable", () => {
    const eff = flattenTemplate(root, resolverFor(child));
    const read = eff.steps.find((s) => s.id === sid("c/read"));
    expect(read?.readsFrom).toEqual({ in: "spec" });
  });

  it("redirects child output writesTo onto the bound host variable", () => {
    const eff = flattenTemplate(root, resolverFor(child));
    const write = eff.steps.find((s) => s.id === sid("c/write"));
    expect(write?.writesTo).toEqual({ out: "result" });
    // interface vars are not reported into the host (consumed by binding)
    expect(eff.variables.map((v) => v.name)).toEqual(["spec", "result"]);
  });
});

describe("flattenTemplate — passThrough sub-routine (sub-workflow-passthrough.md)", () => {
  // Interface-less child: internal-only, cin → cmid → cout.
  const child = tpl("B", {
    entryStep: sid("cin"),
    exitSteps: [sid("cout")],
    steps: [
      step("cin", "human.gate"),
      step("cmid", "claude_code.invoke"),
      step("cout", "human.gate"),
    ],
    transitions: [
      { from: sid("cin"), to: sid("cmid"), isLoop: false },
      { from: sid("cmid"), to: sid("cout"), isLoop: false },
    ],
    variables: [{ name: "tmp", kind: "Markdown", role: "internal" }],
  });

  /** A `workflow.call` to `childId@v1` tagged `passThrough: true`. */
  const ptCall = (id: string, childId: string): StepDef =>
    step(id, "workflow.call", {
      config: { templateId: childId, templateVersion: "v1", passThrough: true },
    });

  it("inlines an interface-less child by control flow only (no data ports)", () => {
    // seed → call(passThrough) → llm
    const root = tpl("A", {
      entryStep: sid("seed"),
      exitSteps: [sid("llm")],
      steps: [step("seed", "user.input"), ptCall("c", "B"), step("llm", "claude_code.invoke")],
      transitions: [
        { from: sid("seed"), to: sid("c"), isLoop: false },
        { from: sid("c"), to: sid("llm"), isLoop: false },
      ],
    });
    const eff = flattenTemplate(root, resolverFor(child));
    expect(hasWorkflowCall(eff)).toBe(false);
    const edge = (from: string, to: string) =>
      eff.transitions.some((t) => t.from === sid(from) && t.to === sid(to));
    expect(edge("seed", "c/cin")).toBe(true);
    expect(edge("c/cout", "llm")).toBe(true);
    // the child's internal var is namespaced into the host, still internal —
    // no input/output port is ever introduced.
    expect(eff.variables.every((v) => v.role === "internal")).toBe(true);
    expect(eff.variables.some((v) => v.name.includes("tmp"))).toBe(true);
    expect(() => validateTemplate(eff)).not.toThrow();
  });

  it("gives disjoint namespaces to multiple passThrough calls of the same child", () => {
    const root = tpl("A", {
      entryStep: sid("c1"),
      exitSteps: [sid("c2")],
      steps: [ptCall("c1", "B"), ptCall("c2", "B")],
      transitions: [{ from: sid("c1"), to: sid("c2"), isLoop: false }],
    });
    const eff = flattenTemplate(root, resolverFor(child));
    const ids = eff.steps.map((s) => s.id);
    expect(ids).toContain(sid("c1/cin"));
    expect(ids).toContain(sid("c2/cin"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(eff.variables.map((v) => v.name)).size).toBe(eff.variables.length);
  });
});

describe("flattenTemplate — guards", () => {
  it("throws on a reference cycle A → B → A, citing the chain", () => {
    const a = tpl("A", { entryStep: sid("ca"), exitSteps: [sid("ca")], steps: [call("ca", "B")] });
    const b = tpl("B", { entryStep: sid("cb"), exitSteps: [sid("cb")], steps: [call("cb", "A")] });
    expect(() => flattenTemplate(a, resolverFor(a, b))).toThrow(FlattenError);
    expect(() => flattenTemplate(a, resolverFor(a, b))).toThrow(/A → B → A/);
  });

  it("throws when the expansion depth exceeds the bound, before any effect", () => {
    // chain of 9: A → t1 → … → t8, each calling the next.
    const chain: WorkflowTemplate[] = [];
    for (let i = 1; i <= 8; i++) {
      const nextId = `t${i}` as string;
      const callee = i === 8 ? "leaf" : `t${i + 1}`;
      void nextId;
      chain.push(
        tpl(`t${i}`, { entryStep: sid(`k${i}`), exitSteps: [sid(`k${i}`)], steps: [call(`k${i}`, callee)] }),
      );
    }
    const leaf = tpl("leaf", { entryStep: sid("leaf-z"), exitSteps: [sid("leaf-z")], steps: [step("leaf-z", "human.gate")] });
    const root = tpl("A", { entryStep: sid("k0"), exitSteps: [sid("k0")], steps: [call("k0", "t1")] });
    // root(0) → t1(1) → … → t8(8) → leaf(9): depth 9 > max 8.
    expect(() => flattenTemplate(root, resolverFor(...chain, leaf), { maxDepth: 8 })).toThrow(
      /MAX_EXPANSION_DEPTH/,
    );
  });

  it("throws on a workflow.call missing its literal ref", () => {
    const root = tpl("A", {
      entryStep: sid("c"),
      exitSteps: [sid("c")],
      steps: [step("c", "workflow.call", { config: {} })],
    });
    expect(() => flattenTemplate(root, noResolve)).toThrow(FlattenError);
  });
});

describe("flattenTemplate — iteration scopes interplay (§9)", () => {
  // child carrying its own foreach/collect pair.
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
  });

  it("a call placed OUTSIDE any host scope inlines and its foreach pairs fine", () => {
    const root = tpl("A", {
      entryStep: sid("c"),
      exitSteps: [sid("c")],
      steps: [call("c", "B")],
    });
    const eff = flattenTemplate(root, resolverFor(looping));
    expect(() => validateTemplate(eff)).not.toThrow();
    const scopes = inferIterationScopes(eff);
    expect(scopes.collectOf.get(sid("c/f"))).toBe(sid("c/col"));
  });

  it("a call placed INSIDE a host foreach produces a loop-nested violation citing the prefix", () => {
    // host foreach hf → c(B) → hcol, with B itself containing a foreach.
    const root = tpl("A", {
      entryStep: sid("hf"),
      exitSteps: [sid("hcol")],
      steps: [
        step("hf", "loop.foreach"),
        call("c", "B"),
        step("hcol", "loop.collect"),
      ],
      transitions: [
        { from: sid("hf"), to: sid("c"), isLoop: false },
        { from: sid("c"), to: sid("hcol"), isLoop: false },
      ],
    });
    const eff = flattenTemplate(root, resolverFor(looping));
    expect(() => inferIterationScopes(eff)).toThrow(/c\/f/);
  });
});

describe("flattenTemplate — output invariant on composed templates", () => {
  it("randomly composed linear sub-routines always flatten to a valid template", () => {
    // A leaf sub-routine and several wrappers calling it; compose them.
    const leaf = (id: string) =>
      tpl(id, {
        entryStep: sid("s"),
        exitSteps: [sid("s")],
        steps: [step("s", "human.gate")],
      });
    const templates: WorkflowTemplate[] = [];
    for (let i = 0; i < 20; i++) {
      const childId = i === 0 ? "leaf" : `w${i - 1}`;
      templates.push(
        tpl(`w${i}`, {
          entryStep: sid("c"),
          exitSteps: [sid("c")],
          steps: [call("c", childId)],
        }),
      );
    }
    const all = [leaf("leaf"), ...templates];
    const resolve = resolverFor(...all);
    // w7 chains 8 deep down to leaf — within the default bound.
    const eff = flattenTemplate(tpl("root", { entryStep: sid("c"), exitSteps: [sid("c")], steps: [call("c", "w6")] }), resolve);
    expect(hasWorkflowCall(eff)).toBe(false);
    expect(() => validateTemplate(eff)).not.toThrow();
    expect(() => inferIterationScopes(eff)).not.toThrow();
    void (undefined as unknown as TemplateId);
  });
});
