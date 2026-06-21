import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { TemplateStepDraft } from "../../../../../domain/workflow/types";
import {
  buildTemplateDraft,
  validateTemplateDraft,
  type BuildTemplateDraftInput,
} from "./build-draft";

// `validateTemplateDraft` only reads `id` / `kind` off each step; cast a minimal
// shape rather than spelling out every TemplateStepDraft field in fixtures.
const draftStep = (id: string, kind = "x"): TemplateStepDraft =>
  ({ id, kind }) as unknown as TemplateStepDraft;

const stepNode = (
  id: string,
  kind: string,
  data: Record<string, unknown> = {},
): Node => ({
  id,
  type: "step",
  position: { x: 0, y: 0 },
  data: { id, kind, isEntry: false, ...data },
});

const edge = (over: Partial<Edge> & Pick<Edge, "id" | "source" | "target">): Edge => ({
  ...over,
});

const baseInput = (over: Partial<BuildTemplateDraftInput> = {}): BuildTemplateDraftInput => ({
  nodes: [],
  edges: [],
  templateId: "tpl",
  version: "v1",
  name: "My template",
  description: "desc",
  entryStepId: null,
  variables: [],
  status: "draft",
  ...over,
});

describe("buildTemplateDraft", () => {
  it("serializes step nodes without the transient isEntry flag", () => {
    const draft = buildTemplateDraft(
      baseInput({ nodes: [stepNode("s1", "user.input")], entryStepId: "s1" }),
    );
    expect(draft.steps).toEqual([{ id: "s1", kind: "user.input" }]);
    expect(draft.entryStep).toBe("s1");
  });

  it("ignores non-step nodes (groups, sticky notes, synthetic)", () => {
    const draft = buildTemplateDraft(
      baseInput({
        nodes: [
          stepNode("s1", "user.input"),
          { id: "grp", type: "group", position: { x: 0, y: 0 }, data: {} },
          { id: "note", type: "stickyNote", position: { x: 0, y: 0 }, data: {} },
        ],
      }),
    );
    expect(draft.steps.map((s) => s.id)).toEqual(["s1"]);
  });

  it("trims id / version / name / description", () => {
    const draft = buildTemplateDraft(
      baseInput({
        templateId: "  tpl  ",
        version: " v2 ",
        name: "  Name  ",
        description: "  d  ",
      }),
    );
    expect(draft.id).toBe("tpl");
    expect(draft.version).toBe("v2");
    expect(draft.name).toBe("Name");
    expect(draft.description).toBe("d");
  });

  it("applies overrides over the live meta (modal-confirmed save)", () => {
    const draft = buildTemplateDraft(baseInput(), {
      id: "other",
      version: "v9",
      name: "Override",
      status: "published",
    });
    expect(draft.id).toBe("other");
    expect(draft.version).toBe("v9");
    expect(draft.name).toBe("Override");
    expect(draft.status).toBe("published");
  });

  it("preserves the current status by default", () => {
    expect(buildTemplateDraft(baseInput({ status: "published" })).status).toBe(
      "published",
    );
  });

  it("derives exitSteps as steps with no non-loop outgoing transition", () => {
    const draft = buildTemplateDraft(
      baseInput({
        nodes: [stepNode("a", "x"), stepNode("b", "x")],
        edges: [edge({ id: "e1", source: "a", target: "b" })],
      }),
    );
    expect(draft.exitSteps).toEqual(["b"]);
  });

  it("keeps the fromPort on an auto-loop source (llm.judge / format.validate)", () => {
    const draft = buildTemplateDraft(
      baseInput({
        nodes: [stepNode("j", "llm.judge")],
        edges: [
          edge({
            id: "e1",
            source: "j",
            target: "j",
            sourceHandle: "approved",
            data: { isLoop: true },
          }),
        ],
      }),
    );
    expect(draft.transitions[0]).toMatchObject({
      from: "j",
      to: "j",
      isLoop: true,
      fromPort: "approved",
    });
  });

  it("strips the fromPort on a human-feedback loop (non auto-loop source)", () => {
    const draft = buildTemplateDraft(
      baseInput({
        nodes: [stepNode("s", "llm.generate")],
        edges: [
          edge({
            id: "e1",
            source: "s",
            target: "s",
            sourceHandle: "out",
            data: { isLoop: true },
          }),
        ],
      }),
    );
    expect(draft.transitions[0].fromPort).toBeUndefined();
    expect(draft.transitions[0].isLoop).toBe(true);
  });

  it("carries an explicit edge order through", () => {
    const draft = buildTemplateDraft(
      baseInput({
        nodes: [stepNode("a", "x"), stepNode("b", "x")],
        edges: [
          edge({ id: "e1", source: "a", target: "b", data: { order: 3 } }),
        ],
      }),
    );
    expect(draft.transitions[0]).toMatchObject({ to: "b", order: 3 });
  });
});

const noDeps = {
  byKind: null,
  variables: [],
  subTemplates: new Map(),
  skillBodies: new Map(),
  refinementResolver: () => null,
};

describe("validateTemplateDraft", () => {
  const draftWith = (over: Partial<ReturnType<typeof buildTemplateDraft>> = {}) =>
    ({
      ...buildTemplateDraft(
        baseInput({ nodes: [stepNode("s1", "x")], entryStepId: "s1" }),
      ),
      ...over,
    });

  it("returns null for a minimal valid draft (no spec catalog)", () => {
    expect(validateTemplateDraft(draftWith(), noDeps)).toBeNull();
  });

  it("flags a missing id / version / name", () => {
    expect(validateTemplateDraft(draftWith({ id: "" }), noDeps)).toMatch(/ID/);
    expect(validateTemplateDraft(draftWith({ version: "" }), noDeps)).toMatch(
      /version/i,
    );
    expect(validateTemplateDraft(draftWith({ name: "" }), noDeps)).toMatch(
      /nom/i,
    );
  });

  it("requires at least one step", () => {
    expect(validateTemplateDraft(draftWith({ steps: [] }), noDeps)).toMatch(
      /étape/,
    );
  });

  it("requires an entry step", () => {
    expect(
      validateTemplateDraft(draftWith({ entryStep: "" }), noDeps),
    ).toMatch(/entrée/);
  });

  it("rejects a duplicate step id", () => {
    const draft = draftWith({
      steps: [draftStep("dup"), draftStep("dup")],
      entryStep: "dup",
    });
    expect(validateTemplateDraft(draft, noDeps)).toMatch(/dupliqué/);
  });

  it("rejects an unknown entry step", () => {
    expect(
      validateTemplateDraft(draftWith({ entryStep: "ghost" }), noDeps),
    ).toMatch(/inconnue/);
  });
});
