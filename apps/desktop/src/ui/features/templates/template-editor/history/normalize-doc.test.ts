import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";

import { docKey, normalizeDoc, stripEdge, stripNode } from "./normalize-doc";
import type { EditorDoc } from "./editor-doc";

const node = (over: Partial<Node> = {}): Node => ({
  id: "step-1",
  type: "step",
  position: { x: 10, y: 20 },
  data: { kind: "user.input", isEntry: true },
  ...over,
});

const edge = (over: Partial<Edge> = {}): Edge => ({
  id: "e-1",
  source: "step-1",
  target: "step-2",
  ...over,
});

const doc = (over: Partial<EditorDoc> = {}): EditorDoc => ({
  nodes: [],
  edges: [],
  entryStepId: null,
  variables: [],
  ...over,
});

describe("stripNode", () => {
  it("retire selected et dragging", () => {
    const stripped = stripNode(node({ selected: true, dragging: true }));
    expect("selected" in stripped).toBe(false);
    expect("dragging" in stripped).toBe(false);
  });

  it("retire data.justDropped et data.isDrawing en conservant le reste de data", () => {
    const stripped = stripNode(
      node({
        data: { kind: "user.input", justDropped: true, isDrawing: true },
      }),
    );
    const data = stripped.data;
    expect("justDropped" in data).toBe(false);
    expect("isDrawing" in data).toBe(false);
    expect(data["kind"]).toBe("user.input");
  });

  it("conserve position, parentId, width/height, measured, type, zIndex", () => {
    const stripped = stripNode(
      node({
        parentId: "grp-1",
        width: 200,
        height: 140,
        measured: { width: 210, height: 150 },
        zIndex: 5,
      }),
    );
    expect(stripped.position).toEqual({ x: 10, y: 20 });
    expect(stripped.parentId).toBe("grp-1");
    expect(stripped.width).toBe(200);
    expect(stripped.height).toBe(140);
    expect(stripped.measured).toEqual({ width: 210, height: 150 });
    expect(stripped.type).toBe("step");
    expect(stripped.zIndex).toBe(5);
  });
});

describe("stripEdge", () => {
  it("retire selected", () => {
    const stripped = stripEdge(edge({ selected: true }));
    expect("selected" in stripped).toBe(false);
    expect(stripped.source).toBe("step-1");
  });
});

describe("normalizeDoc", () => {
  it("filtre les nodes et edges synthétiques", () => {
    const normalized = normalizeDoc(
      doc({
        nodes: [node({ id: "__start__" }), node({ id: "step-1" })],
        edges: [edge({ id: "__start-edge__" }), edge({ id: "e-1" })],
      }),
    );
    expect(normalized.nodes.map((n) => n.id)).toEqual(["step-1"]);
    expect(normalized.edges.map((e) => e.id)).toEqual(["e-1"]);
  });
});

describe("docKey", () => {
  it("est insensible à selected / dragging / justDropped / isDrawing", () => {
    const a = doc({ nodes: [node()] });
    const b = doc({
      nodes: [node({ selected: true, dragging: true, data: { kind: "user.input", isEntry: true, justDropped: true } })],
    });
    expect(docKey(a)).toBe(docKey(b));
  });

  it("distingue deux positions différentes (la position est du document)", () => {
    const a = doc({ nodes: [node({ position: { x: 0, y: 0 } })] });
    const b = doc({ nodes: [node({ position: { x: 99, y: 0 } })] });
    expect(docKey(a)).not.toBe(docKey(b));
  });
});
