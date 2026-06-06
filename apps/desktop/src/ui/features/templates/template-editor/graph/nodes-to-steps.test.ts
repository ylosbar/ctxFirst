import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";

import type { TemplateStepDraft } from "../../../../../domain/workflow/types";
import { nodesToSteps } from "./nodes-to-steps";

const step = (
  id: string,
  extra: Record<string, unknown> = {},
): TemplateStepDraft & Record<string, unknown> => ({
  id,
  name: id,
  kind: "user.input",
  actorRole: "LLMAgent",
  config: {},
  humanGateRequired: false,
  ...extra,
});

const node = (
  id: string,
  type: string,
  data: Record<string, unknown>,
): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});

describe("nodesToSteps", () => {
  it("keeps only step nodes, dropping start/variable/group/sticky nodes", () => {
    const nodes: Node[] = [
      node("s1", "step", step("s1")),
      node("start", "start", {}),
      node("v1", "variable", {}),
      node("g1", "group", {}),
      node("note1", "stickyNote", {}),
      node("s2", "step", step("s2")),
    ];
    expect(nodesToSteps(nodes).map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("strips UI-only fields (isEntry, justDropped, executionOverlay)", () => {
    const nodes: Node[] = [
      node(
        "s1",
        "step",
        step("s1", {
          isEntry: true,
          justDropped: true,
          executionOverlay: { state: "running" },
        }),
      ),
    ];
    const [result] = nodesToSteps(nodes);
    expect(result).not.toHaveProperty("isEntry");
    expect(result).not.toHaveProperty("justDropped");
    expect(result).not.toHaveProperty("executionOverlay");
  });

  it("preserves domain fields and node order", () => {
    const nodes: Node[] = [
      node("b", "step", step("b", { note: "second", isEntry: false })),
      node("a", "step", step("a", { writesTo: { out: "var" } })),
    ];
    const result = nodesToSteps(nodes);
    expect(result.map((s) => s.id)).toEqual(["b", "a"]);
    expect(result[0].note).toBe("second");
    expect(result[1].writesTo).toEqual({ out: "var" });
  });
});
