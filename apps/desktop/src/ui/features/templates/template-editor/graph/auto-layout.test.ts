import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import {
  AUTO_LAYOUT_HORIZONTAL_GAP,
  AUTO_LAYOUT_VERTICAL_GAP,
  computeAutoLayoutOrder,
  computeStepLevels,
  layoutLine,
  type SizedItem,
} from "./auto-layout";

const stepNode = (id: string): Node => ({
  id,
  type: "step",
  position: { x: 0, y: 0 },
  data: {},
});

const edge = (from: string, to: string, isLoop = false): Edge => ({
  id: `e-${from}-${to}`,
  source: from,
  target: to,
  data: { isLoop },
});

describe("auto-layout", () => {
  describe("computeStepLevels", () => {
    it("assigns BFS depth from the entry along non-loop forward edges", () => {
      const levels = computeStepLevels(
        ["a", "b", "c"],
        [
          { from: "a", to: "b", isLoop: false },
          { from: "b", to: "c", isLoop: false },
        ],
        "a",
      );
      expect(levels.get("a")).toBe(0);
      expect(levels.get("b")).toBe(1);
      expect(levels.get("c")).toBe(2);
    });

    it("ignores loop and self transitions when leveling", () => {
      const levels = computeStepLevels(
        ["a", "b"],
        [
          { from: "a", to: "b", isLoop: false },
          { from: "b", to: "a", isLoop: true },
          { from: "a", to: "a", isLoop: false },
        ],
        "a",
      );
      expect(levels.get("a")).toBe(0);
      expect(levels.get("b")).toBe(1);
    });

    it("keeps the deepest level when a node is reachable by several paths", () => {
      const levels = computeStepLevels(
        ["a", "b", "c"],
        [
          { from: "a", to: "b", isLoop: false },
          { from: "a", to: "c", isLoop: false },
          { from: "b", to: "c", isLoop: false },
        ],
        "a",
      );
      expect(levels.get("c")).toBe(2);
    });

    it("defaults unreachable steps to level 0", () => {
      const levels = computeStepLevels(
        ["a", "orphan"],
        [{ from: "a", to: "a", isLoop: false }],
        "a",
      );
      expect(levels.get("orphan")).toBe(0);
    });
  });

  describe("computeAutoLayoutOrder", () => {
    it("orders steps BFS from the entry, then appends unreachable ones in array order", () => {
      const nodes = [stepNode("a"), stepNode("b"), stepNode("c"), stepNode("d")];
      const edges = [edge("a", "b"), edge("b", "c")];
      expect(computeAutoLayoutOrder(nodes, edges, "a")).toEqual([
        "a",
        "b",
        "c",
        "d",
      ]);
    });

    it("skips loop and self edges while traversing", () => {
      const nodes = [stepNode("a"), stepNode("b")];
      const edges = [
        edge("a", "b"),
        edge("b", "a", true),
        edge("a", "a"),
      ];
      expect(computeAutoLayoutOrder(nodes, edges, "a")).toEqual(["a", "b"]);
    });

    it("falls back to the first node when the entry id is unknown", () => {
      const nodes = [stepNode("a"), stepNode("b")];
      expect(computeAutoLayoutOrder(nodes, [edge("a", "b")], "missing")).toEqual([
        "a",
        "b",
      ]);
    });
  });

  describe("layoutLine", () => {
    const items: SizedItem[] = [
      { id: "a", width: 100, height: 40 },
      { id: "b", width: 120, height: 60 },
    ];

    it("stacks vertically at a fixed x, advancing by height + gap", () => {
      const pos = layoutLine(items, ["a", "b"], "vertical", 80, 80);
      expect(pos.get("a")).toEqual({ x: 80, y: 80 });
      expect(pos.get("b")).toEqual({
        x: 80,
        y: 80 + 40 + AUTO_LAYOUT_VERTICAL_GAP,
      });
    });

    it("rows horizontally at a fixed y, advancing by width + gap", () => {
      const pos = layoutLine(items, ["a", "b"], "horizontal", 80, 80);
      expect(pos.get("a")).toEqual({ x: 80, y: 80 });
      expect(pos.get("b")).toEqual({
        x: 80 + 100 + AUTO_LAYOUT_HORIZONTAL_GAP,
        y: 80,
      });
    });

    it("alternates two columns, advancing y on every item", () => {
      const pos = layoutLine(items, ["a", "b"], "two-columns", 0, 0);
      expect(pos.get("a")?.x).toBe(0);
      expect(pos.get("b")?.x).toBeGreaterThan(0);
      expect(pos.get("b")?.y).toBeGreaterThan(0);
    });
  });
});
