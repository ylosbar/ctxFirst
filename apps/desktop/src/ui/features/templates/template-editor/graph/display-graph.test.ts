import type { Edge, Node } from "@xyflow/react";
import type { TemplateVariableDraft } from "@/domain/workflow/types";
import { describe, expect, it } from "vitest";

import {
  START_EDGE_ID,
  START_NODE_ID,
  VARIABLE_EDGE_PREFIX,
  VARIABLE_NODE_PREFIX,
} from "./ids";
import {
  buildDisplayEdges,
  buildDisplayNodes,
  buildVariableArtifacts,
  buildVariableByName,
} from "./display-graph";

const stepNode = (over: Partial<Node> = {}): Node => ({
  id: "s1",
  type: "step",
  position: { x: 100, y: 200 },
  data: { kind: "shell.exec" },
  ...over,
});

const noSubTemplates = new Map();

describe("buildVariableByName", () => {
  it("indexes variables by name", () => {
    const vars: TemplateVariableDraft[] = [
      { name: "foo", kind: "text", description: "d1" },
      { name: "bar", kind: "json", description: "d2" },
    ];
    const map = buildVariableByName(vars);
    expect(map.get("foo")?.kind).toBe("text");
    expect(map.get("bar")?.description).toBe("d2");
  });
});

describe("buildVariableArtifacts", () => {
  it("emits a produced pill to the right and a consumed pill to the left, with synthetic ids", () => {
    const nodes: Node[] = [
      stepNode({
        data: {
          kind: "shell.exec",
          writesTo: { out: "result" },
          readsFrom: { in: "seed" },
        },
      }),
    ];
    const variableByName = buildVariableByName([
      { name: "result", kind: "text", description: "" },
      { name: "seed", kind: "text", description: "" },
    ]);
    const { nodes: vNodes, edges: vEdges } = buildVariableArtifacts(
      nodes,
      variableByName,
      null,
      [],
      noSubTemplates,
    );

    const produced = vNodes.find((n) => n.id.startsWith(`${VARIABLE_NODE_PREFIX}w-`));
    const consumed = vNodes.find((n) => n.id.startsWith(`${VARIABLE_NODE_PREFIX}r-`));
    expect(produced).toBeDefined();
    expect(consumed).toBeDefined();
    // Produced pill sits to the RIGHT of the step (x grows), consumed to the LEFT.
    expect(produced!.position.x).toBeGreaterThan(consumed!.position.x);
    // Both pills are non-interactive presentational nodes.
    expect(produced!.selectable).toBe(false);
    expect(produced!.draggable).toBe(false);
    // One edge per pill, carrying the synthetic edge prefix.
    expect(vEdges).toHaveLength(2);
    expect(vEdges.every((e) => e.id.startsWith(VARIABLE_EDGE_PREFIX))).toBe(true);
  });

  it("ignores non-step nodes", () => {
    const nodes: Node[] = [
      { id: "g1", type: "group", position: { x: 0, y: 0 }, data: {} },
    ];
    const { nodes: vNodes } = buildVariableArtifacts(
      nodes,
      new Map(),
      null,
      [],
      noSubTemplates,
    );
    expect(vNodes).toHaveLength(0);
  });
});

describe("buildDisplayNodes", () => {
  const emptyArtifacts = { nodes: [] as Node[], edges: [] as Edge[] };

  it("prepends a synthetic start node anchored to the entry's absolute position", () => {
    const nodes: Node[] = [stepNode({ id: "s1", position: { x: 100, y: 200 } })];
    const result = buildDisplayNodes(nodes, "s1", emptyArtifacts, undefined);
    // Parents-before-children invariant: the start node leads the array.
    expect(result[0]!.id).toBe(START_NODE_ID);
    expect(result[0]!.position).toEqual({ x: 100 - 110, y: 200 + 16 });
  });

  it("resolves the entry's absolute position when it is nested in a group", () => {
    const nodes: Node[] = [
      { id: "g1", type: "group", position: { x: 1000, y: 500 }, data: {} },
      stepNode({ id: "s1", parentId: "g1", position: { x: 10, y: 20 } }),
    ];
    const result = buildDisplayNodes(nodes, "s1", emptyArtifacts, undefined);
    const start = result.find((n) => n.id === START_NODE_ID)!;
    expect(start.position).toEqual({ x: 1010 - 110, y: 520 + 16 });
  });

  it("omits the start node when there is no entry", () => {
    const nodes: Node[] = [stepNode()];
    const result = buildDisplayNodes(nodes, null, emptyArtifacts, undefined);
    expect(result.some((n) => n.id === START_NODE_ID)).toBe(false);
  });

  it("attaches the execution overlay in view-run mode", () => {
    const nodes: Node[] = [stepNode({ id: "s1" })];
    const exec = { latest: { status: "validated" } } as never;
    const runOverlay = {
      byStepId: new Map([["s1", exec]]),
      selectedStepId: "s1",
      activeTransition: null,
    } as never;
    const result = buildDisplayNodes(nodes, null, emptyArtifacts, runOverlay);
    const s1 = result.find((n) => n.id === "s1")!;
    expect((s1.data as { executionOverlay?: unknown }).executionOverlay).toBe(exec);
    expect(s1.selected).toBe(true);
  });
});

describe("buildDisplayEdges", () => {
  const emptyArtifacts = { nodes: [] as Node[], edges: [] as Edge[] };
  const edge = (over: Partial<Edge> = {}): Edge => ({
    id: "e1",
    source: "s1",
    target: "s2",
    ...over,
  });

  it("prepends a synthetic start edge to the entry", () => {
    const nodes: Node[] = [stepNode({ id: "s1" })];
    const result = buildDisplayEdges([edge()], "s1", nodes, emptyArtifacts, undefined);
    expect(result[0]!.id).toBe(START_EDGE_ID);
    expect(result[0]!.target).toBe("s1");
  });

  it("omits the start edge when the entry node is absent from the graph", () => {
    const result = buildDisplayEdges([edge()], "ghost", [], emptyArtifacts, undefined);
    expect(result.some((e) => e.id === START_EDGE_ID)).toBe(false);
  });

  it("emphasises edges touching the selected node and dims the rest", () => {
    const nodes: Node[] = [
      stepNode({ id: "s1", selected: true }),
      stepNode({ id: "s2" }),
      stepNode({ id: "s3" }),
    ];
    const edges: Edge[] = [
      edge({ id: "e1", source: "s1", target: "s2" }),
      edge({ id: "e2", source: "s2", target: "s3" }),
    ];
    const result = buildDisplayEdges(edges, null, nodes, emptyArtifacts, undefined);
    const connected = result.find((e) => e.id === "e1")!;
    const unrelated = result.find((e) => e.id === "e2")!;
    expect(connected.style?.opacity).toBe(1);
    expect(connected.style?.stroke).toBe("var(--primary)");
    expect(unrelated.style?.opacity).toBe(0.15);
  });

  it("leaves edge styling untouched when nothing is selected", () => {
    const nodes: Node[] = [stepNode({ id: "s1" }), stepNode({ id: "s2" })];
    const result = buildDisplayEdges([edge()], null, nodes, emptyArtifacts, undefined);
    expect(result[0]!.style).toBeUndefined();
  });
});
