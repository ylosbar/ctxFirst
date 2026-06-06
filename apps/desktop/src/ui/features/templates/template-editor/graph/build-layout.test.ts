import type { Node } from "@xyflow/react";
import type { ViewportState } from "@shared/wf/layout";
import { describe, expect, it } from "vitest";

import { buildTemplateLayout } from "./build-layout";
import { isSyntheticId } from "./ids";

const viewport: ViewportState = { x: 0, y: 0, zoom: 1 };
const opts = { viewport, updatedAt: "2026-01-01T00:00:00.000Z", isSynthetic: isSyntheticId };

const stickyNode = (over: Partial<Node> = {}): Node => ({
  id: "note-1",
  type: "stickyNote",
  position: { x: 500, y: 0 },
  width: 120,
  height: 120,
  data: { text: "remember", color: "yellow" },
  ...over,
});

const stepNode = (id: string, over: Partial<Node> = {}): Node => ({
  id,
  type: "step",
  position: { x: 10, y: 20 },
  data: {},
  ...over,
});

describe("buildTemplateLayout", () => {
  // Régression bug §6 : un template neuf contenant un post-it doit le
  // conserver dans le layout du 1er save (le snapshot l'omettait avant).
  it("persists sticky notes (first save of a fresh template keeps post-its)", () => {
    const layout = buildTemplateLayout([stepNode("s1"), stickyNode()], opts);
    expect(layout.stickyNotes).toEqual([
      {
        id: "note-1",
        position: { x: 500, y: 0 },
        size: { width: 120, height: 120 },
        text: "remember",
        color: "yellow",
      },
    ]);
  });

  it("omits stickyNotes / groups keys entirely when there are none", () => {
    const layout = buildTemplateLayout([stepNode("s1")], opts);
    expect(layout.stickyNotes).toBeUndefined();
    expect(layout.groups).toBeUndefined();
    expect(layout.positions).toEqual({ s1: { x: 10, y: 20 } });
  });

  it("serializes groups and preserves a child step's parentId", () => {
    const group: Node = {
      id: "grp-1",
      type: "group",
      position: { x: 0, y: 0 },
      width: 400,
      height: 300,
      data: { label: "Phase 1" },
    };
    const child = stepNode("s1", { parentId: "grp-1", position: { x: 5, y: 6 } });
    const layout = buildTemplateLayout([group, child], opts);
    expect(layout.groups).toEqual([
      {
        id: "grp-1",
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        label: "Phase 1",
      },
    ]);
    expect(layout.positions.s1).toEqual({ x: 5, y: 6, parentId: "grp-1" });
  });

  it("filters synthetic nodes out of the persisted positions", () => {
    const layout = buildTemplateLayout(
      [stepNode("s1"), stepNode("__start__"), stepNode("__var-foo")],
      opts,
    );
    expect(Object.keys(layout.positions)).toEqual(["s1"]);
  });

  it("carries the provided viewport and updatedAt through", () => {
    const layout = buildTemplateLayout([stepNode("s1")], opts);
    expect(layout.viewport).toEqual(viewport);
    expect(layout.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
