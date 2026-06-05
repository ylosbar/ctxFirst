import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import {
  GROUP_PADDING,
  absPosOf,
  findContainingGroupId,
  resizeGroupToFit,
} from "./geometry";

const byId = (nodes: Node[]): Map<string, Node> =>
  new Map(nodes.map((n) => [n.id, n]));

describe("geometry", () => {
  describe("absPosOf", () => {
    it("returns the raw position when the node has no parent", () => {
      const n: Node = { id: "a", position: { x: 10, y: 20 }, data: {} };
      expect(absPosOf(n, byId([n]))).toEqual({ x: 10, y: 20 });
    });

    it("adds the parent absolute position for a child node", () => {
      const parent: Node = { id: "grp", position: { x: 100, y: 100 }, data: {} };
      const child: Node = {
        id: "a",
        position: { x: 10, y: 20 },
        parentId: "grp",
        data: {},
      };
      expect(absPosOf(child, byId([parent, child]))).toEqual({ x: 110, y: 120 });
    });

    it("falls back to the local position when the parent is missing", () => {
      const child: Node = {
        id: "a",
        position: { x: 10, y: 20 },
        parentId: "ghost",
        data: {},
      };
      expect(absPosOf(child, byId([child]))).toEqual({ x: 10, y: 20 });
    });
  });

  describe("findContainingGroupId", () => {
    const g1: Node = {
      id: "g1",
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      data: {},
    };
    const g2: Node = {
      id: "g2",
      position: { x: 50, y: 50 },
      width: 100,
      height: 100,
      data: {},
    };

    it("returns the group whose bbox contains the point", () => {
      expect(findContainingGroupId({ x: 10, y: 10 }, [g1, g2])).toBe("g1");
    });

    it("returns the last group in array order when several overlap", () => {
      expect(findContainingGroupId({ x: 60, y: 60 }, [g1, g2])).toBe("g2");
    });

    it("returns null when no group contains the point", () => {
      expect(findContainingGroupId({ x: 500, y: 500 }, [g1, g2])).toBeNull();
    });
  });

  describe("resizeGroupToFit", () => {
    const group: Node = {
      id: "grp",
      type: "group",
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      data: {},
    };

    it("is a no-op when the group has no step children", () => {
      const out = resizeGroupToFit([group], "grp");
      expect(out.find((n) => n.id === "grp")?.width).toBe(100);
    });

    it("grows the group to enclose a child overflowing on the right", () => {
      // y is kept >= GROUP_PADDING so only the right edge needs to grow.
      const child: Node = {
        id: "a",
        type: "step",
        parentId: "grp",
        position: { x: 200, y: 30 },
        measured: { width: 50, height: 50 },
        data: {},
      };
      const out = resizeGroupToFit([group, child], "grp");
      const g = out.find((n) => n.id === "grp")!;
      expect(g.width).toBe(250 + GROUP_PADDING);
      // grow-only on the right: no shift, child position unchanged
      expect(g.position).toEqual({ x: 0, y: 0 });
      expect(out.find((n) => n.id === "a")?.position).toEqual({ x: 200, y: 30 });
    });

    it("shifts the group and compensates child local coords on left overflow", () => {
      const child: Node = {
        id: "a",
        type: "step",
        parentId: "grp",
        position: { x: -50, y: 10 },
        measured: { width: 50, height: 50 },
        data: {},
      };
      const out = resizeGroupToFit([group, child], "grp");
      const g = out.find((n) => n.id === "grp")!;
      const c = out.find((n) => n.id === "a")!;
      // shiftX = min(0, -50 - 24) = -74 → group moves left, child compensates
      expect(g.position.x).toBe(-74);
      expect(c.position.x).toBe(-50 - -74);
    });
  });
});
