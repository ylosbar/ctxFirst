import type { TemplateLayout } from "@shared/wf/layout";
import type { TemplateView } from "@/domain/workflow/types";
import { describe, expect, it } from "vitest";

import { templateToGraph } from "./template-to-graph";

const tpl = (over: Partial<TemplateView> = {}): TemplateView => ({
  id: "tpl",
  version: "1.0.0",
  name: "Tpl",
  description: "",
  entryStep: "s1",
  exitSteps: ["s2"],
  steps: [
    {
      id: "s1",
      name: "Step 1",
      kind: "user.input",
      actorRole: "PO",
      humanGateRequired: false,
    },
    {
      id: "s2",
      name: "Step 2",
      kind: "shell.exec",
      actorRole: "Developer",
      humanGateRequired: false,
    },
  ],
  transitions: [
    { from: "s1", to: "s2", isLoop: false },
    { from: "s1", to: "s1", isLoop: false },
  ],
  variables: [],
  status: "draft",
  ...over,
});

describe("templateToGraph", () => {
  it("emits groups, then sticky notes, then steps (parents-before-children invariant)", () => {
    const layout: TemplateLayout = {
      positions: { s1: { x: 10, y: 10, parentId: "grp-1" } },
      groups: [
        { id: "grp-1", position: { x: 0, y: 0 }, size: { width: 400, height: 400 } },
      ],
      stickyNotes: [
        {
          id: "note-1",
          position: { x: 500, y: 0 },
          size: { width: 120, height: 120 },
          text: "hi",
        },
      ],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const { nodes, entryStepId } = templateToGraph(tpl(), layout);
    expect(nodes[0].type).toBe("group");
    expect(nodes[1].type).toBe("stickyNote");
    expect(nodes.slice(2).every((n) => n.type === "step")).toBe(true);
    expect(entryStepId).toBe("s1");
  });

  it("keeps a saved parentId and the layout-relative position for a child step", () => {
    const layout: TemplateLayout = {
      positions: { s1: { x: 10, y: 20, parentId: "grp-1" } },
      groups: [
        { id: "grp-1", position: { x: 0, y: 0 }, size: { width: 400, height: 400 } },
      ],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const { nodes } = templateToGraph(tpl(), layout);
    const s1 = nodes.find((n) => n.id === "s1")!;
    expect(s1.parentId).toBe("grp-1");
    expect(s1.position).toEqual({ x: 10, y: 20 });
  });

  it("marks the entry step's data.isEntry", () => {
    const { nodes } = templateToGraph(tpl(), null);
    const s1 = nodes.find((n) => n.id === "s1")!;
    const s2 = nodes.find((n) => n.id === "s2")!;
    expect((s1.data as { isEntry?: boolean }).isEntry).toBe(true);
    expect((s2.data as { isEntry?: boolean }).isEntry).toBe(false);
  });

  it("renders a self-loop transition as a selfLoop edge above the others", () => {
    const { edges } = templateToGraph(tpl(), null);
    expect(edges).toHaveLength(2);
    const self = edges.find((e) => e.source === e.target)!;
    expect(self.type).toBe("selfLoop");
    expect(self.zIndex).toBe(1000);
    const normal = edges.find((e) => e.source !== e.target)!;
    expect(normal.type).toBe("step");
  });
});
