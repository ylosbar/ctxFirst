import { describe, expect, it } from "vitest";
import { buildTemplate } from "../../__tests__/fixtures/builders";
import type { WorkflowTemplate } from "../template";
import type { TemplateInvokeRef } from "./template-invoke";
import { TemplateInvokeError, templateInvokeRefKey } from "./template-invoke";
import { validateTemplateInvokes } from "./validate-template-invokes";

// A minimal invocable sub-template: input `spec` read by the (entry+exit) body,
// output `summary` written by it.
const childB: WorkflowTemplate = buildTemplate(
  "B",
  [{ id: "body", kind: "test.echo", readsFrom: { in: "spec" }, writesTo: { out: "summary" } }],
  [],
  {
    id: "B",
    exitSteps: ["body"],
    status: "published",
    variables: [
      { name: "spec", kind: "Markdown", role: "input" },
      { name: "summary", kind: "Markdown", role: "output" },
    ],
  },
);

const rootInvoking = (
  invoke: Parameters<typeof buildTemplate>[1][number],
  variables: WorkflowTemplate["variables"],
): WorkflowTemplate =>
  buildTemplate("A", [invoke], [], { id: "A", status: "published", variables: [...variables] });

const resolverOf =
  (...tpls: WorkflowTemplate[]) =>
  (ref: TemplateInvokeRef): WorkflowTemplate | undefined => {
    const key = templateInvokeRefKey(ref);
    return tpls.find((t) => `${t.id}@${t.version}` === key);
  };

describe("validateTemplateInvokes", () => {
  it("accepts a well-formed invoke with bound, kind-compatible interface", () => {
    const root = rootInvoking(
      {
        id: "inv",
        kind: "template.invoke",
        config: { templateId: "B", templateVersion: "v1" },
        readsFrom: { spec: "specVar" },
        writesTo: { summary: "sumVar" },
      },
      [
        { name: "specVar", kind: "Markdown" },
        { name: "sumVar", kind: "Markdown" },
      ],
    );
    expect(() => validateTemplateInvokes(root, resolverOf(childB))).not.toThrow();
  });

  it("rejects a step missing the literal templateId/version (rule 1/6)", () => {
    const root = rootInvoking(
      { id: "inv", kind: "template.invoke", config: {}, readsFrom: {}, writesTo: {} },
      [],
    );
    expect(() => validateTemplateInvokes(root, resolverOf(childB))).toThrow(TemplateInvokeError);
  });

  it("rejects a sub-template with no interface (rule 2)", () => {
    const blackBox = buildTemplate(
      "BB",
      [{ id: "body", kind: "test.echo" }],
      [],
      { id: "BB", status: "published", variables: [] },
    );
    const root = rootInvoking(
      {
        id: "inv",
        kind: "template.invoke",
        config: { templateId: "BB", templateVersion: "v1" },
      },
      [],
    );
    expect(() => validateTemplateInvokes(root, resolverOf(blackBox))).toThrow(/not invocable/);
  });

  it("rejects when an input variable is not bound by readsFrom (rule 4)", () => {
    const root = rootInvoking(
      {
        id: "inv",
        kind: "template.invoke",
        config: { templateId: "B", templateVersion: "v1" },
        readsFrom: {},
        writesTo: { summary: "sumVar" },
      },
      [{ name: "sumVar", kind: "Markdown" }],
    );
    expect(() => validateTemplateInvokes(root, resolverOf(childB))).toThrow(/must bind input/);
  });

  it("rejects a kind-incompatible input binding (rule 7)", () => {
    const root = rootInvoking(
      {
        id: "inv",
        kind: "template.invoke",
        config: { templateId: "B", templateVersion: "v1" },
        readsFrom: { spec: "specVar" },
      },
      [{ name: "specVar", kind: "Json" }],
    );
    expect(() => validateTemplateInvokes(root, resolverOf(childB))).toThrow(/expects Markdown/);
  });

  it("rejects a reference cycle A → B → A (rule 5)", () => {
    // Two mutually-invoking, individually-coherent templates: A invokes B and
    // B invokes A. Both have a bound, kind-compatible interface so the cycle is
    // what trips validation (not an earlier binding/coherence rule).
    const cycA: WorkflowTemplate = buildTemplate(
      "A",
      [
        {
          id: "invB",
          kind: "template.invoke",
          config: { templateId: "B", templateVersion: "v1" },
          readsFrom: { bin: "ain" },
          writesTo: { bout: "aout" },
        },
      ],
      [],
      {
        id: "A",
        status: "published",
        exitSteps: ["invB"],
        variables: [
          { name: "ain", kind: "Markdown", role: "input" },
          { name: "aout", kind: "Markdown", role: "output" },
        ],
      },
    );
    const cycB: WorkflowTemplate = buildTemplate(
      "B",
      [
        {
          id: "invA",
          kind: "template.invoke",
          config: { templateId: "A", templateVersion: "v1" },
          readsFrom: { ain: "bin" },
          writesTo: { aout: "bout" },
        },
      ],
      [],
      {
        id: "B",
        status: "published",
        exitSteps: ["invA"],
        variables: [
          { name: "bin", kind: "Markdown", role: "input" },
          { name: "bout", kind: "Markdown", role: "output" },
        ],
      },
    );
    expect(() => validateTemplateInvokes(cycA, resolverOf(cycA, cycB))).toThrow(/cycle/);
  });

  it("rejects a chain deeper than maxDepth (§14)", () => {
    const root = rootInvoking(
      {
        id: "inv",
        kind: "template.invoke",
        config: { templateId: "B", templateVersion: "v1" },
        readsFrom: { spec: "specVar" },
        writesTo: { summary: "sumVar" },
      },
      [
        { name: "specVar", kind: "Markdown" },
        { name: "sumVar", kind: "Markdown" },
      ],
    );
    // root = depth 0, B = depth 1 → exceeds maxDepth 0.
    expect(() =>
      validateTemplateInvokes(root, resolverOf(childB), { maxDepth: 0 }),
    ).toThrow(/max depth/);
  });
});
