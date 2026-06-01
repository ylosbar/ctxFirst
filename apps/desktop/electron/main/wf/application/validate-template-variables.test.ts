import { describe, expect, it } from "vitest";
import {
  asStepId,
  asTemplateId,
  asTemplateVersion,
} from "../domain/ids";
import {
  TemplatePortError,
  type StepDef,
  type TemplateVariable,
  type Transition,
  type WorkflowTemplate,
} from "../domain/template";
import { validateTemplatePorts } from "./validate-template-ports";
import type {
  NodeSpec,
  PortSpec,
  StepRunner,
  StepRunnerRegistry,
} from "./step-runner";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const step = (id: string, overrides: Partial<StepDef> = {}): StepDef => ({
  id: asStepId(id),
  name: id,
  kind: "user.input",
  actorRole: "PO",
  config: {},
  humanGateRequired: false,
  ...overrides,
});

const edge = (
  from: string,
  to: string,
  isLoop = false,
  opts: Partial<Transition> = {},
): Transition => ({
  from: asStepId(from),
  to: asStepId(to),
  isLoop,
  ...opts,
});

const variable = (
  name: string,
  kind: string = "Markdown",
  description?: string,
): TemplateVariable => ({
  name,
  kind: kind as TemplateVariable["kind"],
  description,
});

const template = (
  over: Partial<WorkflowTemplate> = {},
): WorkflowTemplate => ({
  id: asTemplateId("t"),
  name: "t",
  description: "",
  version: asTemplateVersion("v1"),
  entryStep: asStepId("a"),
  exitSteps: [asStepId("b")],
  steps: [step("a"), step("b", { kind: "human.gate" })],
  transitions: [edge("a", "b")],
  variables: [],
  status: "draft",
  ...over,
});

// ---------------------------------------------------------------------------
// Mock runner registry
// ---------------------------------------------------------------------------

type SpecOverride = {
  inputs?: PortSpec[];
  outputs?: { kind: string; name: string }[];
  passthrough?: boolean;
};

/**
 * Default specs keyed by step kind. Override per-test by passing a map to
 * `makeRegistry`.
 */
const DEFAULT_SPECS: Record<string, NodeSpec> = {
  "user.input": {
    title: "Input",
    inputs: [],
    outputs: [{ kind: "Markdown", name: "out" }],
  },
  "claude_code.invoke": {
    title: "LLM Invoke",
    inputs: [{ name: "prompt", kinds: ["*"], optional: false }],
    outputs: [{ kind: "Markdown", name: "out" }],
  },
  "human.gate": {
    title: "Human Gate",
    inputs: [{ name: "input", kinds: ["*"], optional: true }],
    outputs: [],
  },
  "multi_output": {
    title: "Multi Output",
    inputs: [{ name: "input", kinds: ["*"] }],
    outputs: [
      { kind: "Markdown", name: "title" },
      { kind: "plugin:linear:Ticket@v1", name: "ticket" },
    ],
  },
  "wildcard_in": {
    title: "Wildcard In",
    inputs: [{ name: "input", kinds: ["*"] }],
    outputs: [{ kind: "Markdown", name: "out" }],
  },
};

const makeRegistry = (
  overrides: Record<string, SpecOverride> = {},
): StepRunnerRegistry => {
  const specs = { ...DEFAULT_SPECS };
  for (const [kind, ov] of Object.entries(overrides)) {
    specs[kind] = {
      title: kind,
      inputs: ov.inputs ?? [],
      outputs: (ov.outputs ?? []) as NodeSpec["outputs"],
      passthrough: ov.passthrough,
    };
  }

  const runners = new Map<string, StepRunner>();
  for (const [kind, spec] of Object.entries(specs)) {
    runners.set(kind, {
      kind,
      resolveSpec: () => spec,
      run: async () => ({ kind: "produced", artifact: { id: "x" as any, kind: "Markdown" as any, hash: "h" as any, storageRef: "r", metadata: {}, createdAt: "" } } as any),
    });
  }

  return {
    register: () => {},
    unregister: () => false,
    resolve: (kind: string) => {
      const r = runners.get(kind);
      if (!r) throw new Error(`no runner: ${kind}`);
      return r;
    },
    listKinds: () => [...runners.keys()],
  };
};

// ---------------------------------------------------------------------------
// Tests – writesTo rules (3-5)
// ---------------------------------------------------------------------------

describe("validateTemplateVariables — writesTo", () => {
  const registry = makeRegistry();

  it("Rule 3: rejects writesTo key that is not a declared output slot", () => {
    const tpl = template({
      variables: [variable("draft")],
      steps: [
        step("a", { writesTo: { nonexistent: "draft" } }),
        step("b", { kind: "human.gate" }),
      ],
    });
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(TemplatePortError);
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(/writesTo.*nonexistent.*no such output/);
  });

  it("Rule 4: rejects writesTo value pointing to an undeclared variable", () => {
    const tpl = template({
      variables: [],
      steps: [
        step("a", { writesTo: { out: "ghost" } }),
        step("b", { kind: "human.gate" }),
      ],
    });
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(TemplatePortError);
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(/writesTo.*ghost.*not declared/);
  });

  it("Rule 5: rejects writesTo with kind mismatch (slot Markdown → variable plugin:linear:Ticket@v1)", () => {
    const tpl = template({
      variables: [variable("ticket", "plugin:linear:Ticket@v1")],
      steps: [
        step("a", { writesTo: { out: "ticket" } }),
        step("b", { kind: "human.gate" }),
      ],
    });
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(TemplatePortError);
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(/kind mismatch/);
  });

  it("accepts a valid writesTo mapping", () => {
    const tpl = template({
      variables: [variable("draft")],
      steps: [
        step("a", { writesTo: { out: "draft" } }),
        step("b", { kind: "human.gate" }),
      ],
    });
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });

  it("Rule 3: accepts writesTo on a multi-output step with valid slot name", () => {
    const tpl = template({
      variables: [variable("t"), variable("tk", "plugin:linear:Ticket@v1")],
      steps: [
        step("a", { kind: "multi_output", writesTo: { title: "t", ticket: "tk" } }),
        step("b", { kind: "human.gate" }),
      ],
      transitions: [edge("a", "b", false, { fromPort: "title" })],
      exitSteps: [asStepId("b")],
    });
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests – readsFrom rules (6-10)
// ---------------------------------------------------------------------------

describe("validateTemplateVariables — readsFrom", () => {
  const registry = makeRegistry();

  it("Rule 6: rejects readsFrom key that is not a declared input port", () => {
    const tpl = template({
      variables: [variable("draft")],
      steps: [
        step("a", { writesTo: { out: "draft" } }),
        step("b", {
          kind: "claude_code.invoke",
          readsFrom: { badPort: "draft" },
        }),
      ],
      transitions: [edge("a", "b")],
      exitSteps: [asStepId("b")],
    });
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(TemplatePortError);
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(/readsFrom.*badPort.*no such input/);
  });

  it("Rule 7: rejects readsFrom value pointing to an undeclared variable", () => {
    const tpl = template({
      variables: [],
      steps: [
        step("a"),
        step("b", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "ghost" },
        }),
      ],
      transitions: [edge("a", "b")],
      exitSteps: [asStepId("b")],
    });
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(TemplatePortError);
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(/readsFrom.*ghost.*not declared/);
  });

  it("Rule 8: rejects readsFrom with kind mismatch (variable Markdown → port accepting plugin:linear:Ticket@v1 only)", () => {
    // Transitions are type-safe, but the readsFrom variable kind doesn't match
    // the port's accepted kinds.
    const customRegistry = makeRegistry({
      "linear.fetch": {
        inputs: [{ name: "input", kinds: ["*"], optional: true }],
        outputs: [{ kind: "plugin:linear:Ticket@v1", name: "ticket" }],
      },
      "ticket_consumer": {
        inputs: [{ name: "ref", kinds: ["plugin:linear:Ticket@v1"] }],
        outputs: [{ kind: "Markdown", name: "out" }],
      },
    });
    const tpl = template({
      variables: [
        variable("ticket", "plugin:linear:Ticket@v1"),
        variable("desc", "Markdown"),
      ],
      steps: [
        step("src", { kind: "linear.fetch", writesTo: { ticket: "ticket" } }),
        step("consumer", {
          kind: "ticket_consumer",
          readsFrom: { ref: "desc" },
        }),
        step("desc_writer", { writesTo: { out: "desc" } }),
      ],
      entryStep: asStepId("desc_writer"),
      transitions: [edge("desc_writer", "src"), edge("src", "consumer")],
      exitSteps: [asStepId("consumer")],
    });
    expect(() => validateTemplatePorts(tpl, customRegistry)).toThrow(TemplatePortError);
    expect(() => validateTemplatePorts(tpl, customRegistry)).toThrow(/kind mismatch/);
  });

  it("Rule 8: accepts readsFrom when port has wildcard matcher", () => {
    const monoRegistry = makeRegistry({
      "linear.fetch": {
        inputs: [{ name: "input", kinds: ["*"], optional: true }],
        outputs: [{ kind: "plugin:linear:Ticket@v1", name: "ticket" }],
      },
    });
    const tpl = template({
      variables: [variable("data", "plugin:linear:Ticket@v1")],
      steps: [
        step("a", { kind: "linear.fetch", writesTo: { ticket: "data" } }),
        step("b", {
          kind: "wildcard_in",
          readsFrom: { input: "data" },
        }),
      ],
      transitions: [edge("a", "b")],
      exitSteps: [asStepId("b")],
    });
    expect(() => validateTemplatePorts(tpl, monoRegistry)).not.toThrow();
  });

  it("Rule 9: rejects readsFrom when no producer writes to the variable", () => {
    const tpl = template({
      variables: [variable("orphan")],
      steps: [
        step("a"),
        step("b", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "orphan" },
        }),
      ],
      transitions: [edge("a", "b")],
      exitSteps: [asStepId("b")],
    });
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(TemplatePortError);
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(/no step writes/);
  });

  it("Rule 9: rejects readsFrom when producer is downstream (not an ancestor)", () => {
    const tpl = template({
      variables: [variable("draft")],
      steps: [
        step("a", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "draft" },
        }),
        step("b", { kind: "claude_code.invoke", writesTo: { out: "draft" } }),
        step("c", { kind: "human.gate" }),
      ],
      entryStep: asStepId("a"),
      transitions: [edge("a", "b"), edge("b", "c")],
      exitSteps: [asStepId("c")],
    });
    // Step "a" is the entry and reads "draft" but "b" (the producer) is downstream.
    // "a" has no incoming transition and is the entry step, so rule 10 doesn't apply.
    // But rule 9 should catch it: "b" is not an ancestor of "a".
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(TemplatePortError);
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(/not ancestors/);
  });

  it("Rule 9: accepts readsFrom when producer is an ancestor via non-loop edges", () => {
    const tpl = template({
      variables: [variable("draft")],
      steps: [
        step("a", { writesTo: { out: "draft" } }),
        step("b", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "draft" },
        }),
        step("c", { kind: "human.gate" }),
      ],
      transitions: [edge("a", "b"), edge("b", "c")],
      exitSteps: [asStepId("c")],
    });
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });

  it("Rule 9: accepts readsFrom when the step is in a loop and the producer wrote before the loop", () => {
    const tpl = template({
      variables: [variable("draft")],
      steps: [
        step("a", { writesTo: { out: "draft" } }),
        step("b", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "draft" },
        }),
        step("c", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "draft" },
        }),
      ],
      transitions: [
        edge("a", "b"),
        edge("b", "c"),
        edge("c", "b", true), // loop back
      ],
      exitSteps: [asStepId("c")],
    });
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });

  it("Rule 9: accepts readsFrom on a `role: input` variable with no producer (caller-seeded sub-template interface)", () => {
    // Sub-template shape: the entry step reads its `input` interface variable,
    // which is seeded by the caller (or `workflow.call` rebind) — never written
    // by a step. Must save without a `writesTo` producer.
    const tpl = template({
      variables: [
        { name: "itemString", kind: "Markdown" as const, role: "input" },
        { name: "answer", kind: "Markdown" as const, role: "output" },
      ],
      steps: [
        step("claude", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "itemString" },
          writesTo: { out: "answer" },
        }),
      ],
      entryStep: asStepId("claude"),
      transitions: [],
      exitSteps: [asStepId("claude")],
    });
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });

  it("Rule 9: accepts readsFrom on a variable with a defaultValue and no producer (pre-seeded at launch)", () => {
    const tpl = template({
      variables: [
        { name: "seeded", kind: "Markdown" as const, defaultValue: "x" },
      ],
      steps: [
        step("a"),
        step("b", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "seeded" },
        }),
      ],
      transitions: [edge("a", "b")],
      exitSteps: [asStepId("b")],
    });
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });

  it("Rule 10: rejects readsFrom without any incoming control-flow transition (non-entry)", () => {
    // step "b" both writes and reads "draft" — rule 9 passes via self-reference
    // (p === step.id) but rule 10 fails because "b" has no incoming transition
    // and is not the entry step.
    const tpl = template({
      variables: [variable("draft")],
      steps: [
        step("a"),
        step("b", {
          kind: "claude_code.invoke",
          writesTo: { out: "draft" },
          readsFrom: { prompt: "draft" },
        }),
      ],
      transitions: [],
      exitSteps: [asStepId("b")],
    });
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(TemplatePortError);
    expect(() => validateTemplatePorts(tpl, registry)).toThrow(/no incoming control-flow transition/);
  });

  it("Rule 10: accepts readsFrom on the entry step without incoming transition", () => {
    const tpl = template({
      variables: [variable("seed")],
      steps: [
        step("a", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "seed" },
          writesTo: { out: "seed" },
        }),
        step("b", { kind: "human.gate" }),
      ],
      entryStep: asStepId("a"),
      transitions: [edge("a", "b")],
      exitSteps: [asStepId("b")],
    });
    // Entry step reads from "seed" — allowed even without incoming transition.
    // Rule 9: "a" itself writes to "seed" and `p === step.id` is accepted.
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests – coexistence (rule 11, multiple consumers)
// ---------------------------------------------------------------------------

describe("validateTemplateVariables — coexistence and multi-consumer", () => {
  const registry = makeRegistry();

  it("accepts two consumers reading the same variable sequentially", () => {
    const tpl = template({
      variables: [variable("desc")],
      steps: [
        step("a", { writesTo: { out: "desc" } }),
        step("b", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "desc" },
        }),
        step("c", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "desc" },
        }),
      ],
      transitions: [edge("a", "b"), edge("b", "c")],
      exitSteps: [asStepId("c")],
    });
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });

  it("Rule 11: a readsFrom input coexists with its control-flow transition (data from variable, control from edge)", () => {
    const tpl = template({
      variables: [variable("draft")],
      steps: [
        step("a", { writesTo: { out: "draft" } }),
        step("b", {
          kind: "claude_code.invoke",
          readsFrom: { prompt: "draft" },
        }),
      ],
      transitions: [edge("a", "b")],
      exitSteps: [asStepId("b")],
    });
    // The transition a→b serves as control flow; data comes from the variable.
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests – backward compatibility
// ---------------------------------------------------------------------------

describe("validateTemplateVariables — backward compatibility", () => {
  const registry = makeRegistry();

  it("accepts templates with no variables and no writesTo/readsFrom (pre-migration)", () => {
    const tpl = template();
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });

  it("accepts templates with empty variables array", () => {
    const tpl = template({ variables: [] });
    expect(() => validateTemplatePorts(tpl, registry)).not.toThrow();
  });
});
