/**
 * Dérivation **pure** du graphe d'affichage à partir de l'état xyflow.
 *
 * Trois étages, sans aucun couplage au state React (testables unitairement) :
 *   - `buildVariableArtifacts` — pills variables (`writesTo`/`readsFrom`) + leurs
 *     edges en pointillés, positionnés en coordonnées absolues alignés sur les
 *     ports de chaque step ;
 *   - `buildDisplayNodes` — ajoute le start node synthétique + l'overlay
 *     d'exécution (mode view-run) aux nodes réelles ;
 *   - `buildDisplayEdges` — décore les edges (overlay run, surbrillance de la
 *     sélection) et préfixe le start edge.
 *
 * Ces fonctions ne calculent que du présentationnel : elles ne mutent jamais
 * l'état source. L'orchestrateur les compose via `useDisplayGraph` (mémoïsation
 * identique à l'ancien inline pour préserver la fréquence de recalcul).
 */
import type { Edge, Node } from "@xyflow/react";
import type {
  TemplateStepDraft,
  TemplateVariableDraft,
  TemplateVariableView,
} from "@/domain/workflow/types";

import type { RunOverlay } from "../../run-overlay";
import { absPosOf } from "./geometry";
import {
  START_EDGE_ID,
  START_NODE_ID,
  VARIABLE_EDGE_PREFIX,
  VARIABLE_NODE_PREFIX,
} from "./ids";
import { resolveStepSpec, type ByKind } from "./step-spec";

export type SubTemplates = ReadonlyMap<
  string,
  ReadonlyArray<TemplateVariableView>
>;

export const buildVariableByName = (
  variables: ReadonlyArray<TemplateVariableDraft>,
): Map<string, TemplateVariableDraft> => {
  const map = new Map<string, TemplateVariableDraft>();
  for (const v of variables) map.set(v.name, v);
  return map;
};

export const buildVariableArtifacts = (
  nodes: Node[],
  variableByName: Map<string, TemplateVariableDraft>,
  byKind: ByKind | null,
  variables: ReadonlyArray<TemplateVariableDraft>,
  subTemplates: SubTemplates,
): { nodes: Node[]; edges: Edge[] } => {
  const vNodes: Node[] = [];
  const vEdges: Edge[] = [];
  // Les pills variables sont des nodes top-level (pas de parentId) — leurs
  // positions doivent donc être absolues. Si la step source est enfant
  // d'un groupe, sa `position` est relative ; on remonte via `absPosOf`.
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const horizontalGap = 200;
  const variablePillWidth = 110;
  const variablePillHeight = 22;
  // Stable hash → hue so each distinct variable gets a unique edge color
  // (and two edges of the same variable share it, helping track flow).
  const edgeColorForVariable = (name: string): string => {
    let h = 0;
    for (let i = 0; i < name.length; i += 1) {
      h = (h * 31 + name.charCodeAt(i)) | 0;
    }
    const hue = ((h % 360) + 360) % 360;
    return `hsl(${hue} 70% 55%)`;
  };
  // Approximate offsets to align a variable pill with its port row in the
  // step body. The step header is ~38px tall, then a 1px border, then a
  // 4px column padding (py-1). Each port row is h-4 (16px) and the handle
  // sits at the row vertical center.
  const headerHeight = 38;
  const portColumnPaddingTop = 4;
  const portRowHeight = 16;
  const variablePillYOffset = 40;
  // Extra vertical spacing between stacked variable pills so they don't
  // overlap (pills are taller than a port row) and stay easy to read.
  const variablePillVerticalGap = 18;
  const pillYForPortIndex = (nodeY: number, portIdx: number) =>
    nodeY +
    headerHeight +
    1 +
    portColumnPaddingTop +
    portIdx * (portRowHeight + variablePillVerticalGap) +
    portRowHeight / 2 -
    variablePillHeight / 2 +
    variablePillYOffset;
  for (const n of nodes) {
    if (n.type !== "step") continue;
    const step = n.data as unknown as TemplateStepDraft;
    const stepWidth = n.measured?.width ?? 200;
    const spec = byKind ? resolveStepSpec(step, byKind, variables, subTemplates) : null;
    const stepAbs = absPosOf(n, nodesById);

    const writes = step.writesTo ? Object.entries(step.writesTo) : [];
    const reads = step.readsFrom ? Object.entries(step.readsFrom) : [];

    // Writes are produced on the step's right-side output handles. We
    // align each pill horizontally with its source port so the edge is a
    // short, straight-shot segment instead of a long detour.
    writes.forEach(([port, varName], fallbackIdx) => {
      const specIdx = spec?.outputs.findIndex((p) => p.name === port) ?? -1;
      const portIdx = specIdx >= 0 ? specIdx : fallbackIdx;
      const decl = variableByName.get(varName);
      const id = `${VARIABLE_NODE_PREFIX}w-${n.id}-${port}`;
      vNodes.push({
        id,
        type: "variable",
        position: {
          x: stepAbs.x + stepWidth + horizontalGap,
          y: pillYForPortIndex(stepAbs.y, portIdx),
        },
        data: {
          variableName: varName,
          kind: decl?.kind,
          description: decl?.description,
          port,
          mode: "produced",
        },
        selectable: false,
        draggable: false,
        deletable: false,
        connectable: false,
      });
      vEdges.push({
        id: `${VARIABLE_EDGE_PREFIX}w-${n.id}-${port}`,
        source: n.id,
        sourceHandle: port,
        target: id,
        type: "default",
        selectable: false,
        deletable: false,
        focusable: false,
        style: {
          strokeDasharray: "3 3",
          opacity: 0.7,
          stroke: edgeColorForVariable(varName),
        },
      });
    });

    // Reads land on the step's left-side input handles, so their pills go
    // to the LEFT of the node — aligned with the matching port row.
    reads.forEach(([port, varName], fallbackIdx) => {
      const specIdx = spec?.inputs.findIndex((p) => p.name === port) ?? -1;
      const portIdx = specIdx >= 0 ? specIdx : fallbackIdx;
      const decl = variableByName.get(varName);
      const id = `${VARIABLE_NODE_PREFIX}r-${n.id}-${port}`;
      vNodes.push({
        id,
        type: "variable",
        position: {
          x: stepAbs.x - variablePillWidth - horizontalGap,
          y: pillYForPortIndex(stepAbs.y, portIdx),
        },
        data: {
          variableName: varName,
          kind: decl?.kind,
          description: decl?.description,
          port,
          mode: "consumed",
        },
        selectable: false,
        draggable: false,
        deletable: false,
        connectable: false,
      });
      vEdges.push({
        id: `${VARIABLE_EDGE_PREFIX}r-${n.id}-${port}`,
        source: id,
        target: n.id,
        targetHandle: port,
        type: "default",
        selectable: false,
        deletable: false,
        focusable: false,
        style: {
          strokeDasharray: "3 3",
          opacity: 0.7,
          stroke: edgeColorForVariable(varName),
        },
      });
    });
  }
  return { nodes: vNodes, edges: vEdges };
};

export const buildDisplayNodes = (
  nodes: Node[],
  entryStepId: string | null,
  variableArtifacts: { nodes: Node[]; edges: Edge[] },
  runOverlay: RunOverlay | undefined,
): Node[] => {
  const nodesWithOverlay: Node[] = runOverlay
    ? nodes.map((n) => {
        if (n.type !== "step") return n;
        const exec = runOverlay.byStepId.get(n.id);
        if (!exec) return n;
        return {
          ...n,
          selected: runOverlay.selectedStepId === n.id,
          data: { ...(n.data as object), executionOverlay: exec },
        };
      })
    : nodes;
  const withVars = [...nodesWithOverlay, ...variableArtifacts.nodes];
  if (!entryStepId) return withVars;
  const entry = nodes.find((n) => n.id === entryStepId);
  if (!entry) return withVars;
  // Le start node est top-level (sans parentId) → position absolue, donc
  // on remonte la coord absolue de l'entry (qui peut être enfant d'un
  // groupe et avoir une `position` relative).
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const entryAbs = absPosOf(entry, nodesById);
  const startNode: Node = {
    id: START_NODE_ID,
    type: "start",
    position: { x: entryAbs.x - 110, y: entryAbs.y + 16 },
    data: {},
    selectable: false,
    draggable: false,
    deletable: false,
    connectable: false,
  };
  return [startNode, ...withVars];
};

export const buildDisplayEdges = (
  edges: Edge[],
  entryStepId: string | null,
  nodes: Node[],
  variableArtifacts: { nodes: Node[]; edges: Edge[] },
  runOverlay: RunOverlay | undefined,
): Edge[] => {
  const styledEdges: Edge[] = runOverlay
    ? edges.map((e) => {
        const decorated = e;
        const fromOverlay = runOverlay.byStepId.get(decorated.source);
        const toOverlay = runOverlay.byStepId.get(decorated.target);
        const isExecuted =
          fromOverlay?.latest?.status === "validated" &&
          toOverlay?.latest !== null &&
          toOverlay?.latest !== undefined &&
          toOverlay.latest.status !== "pending";
        const active = runOverlay.activeTransition;
        const isActive =
          active !== null &&
          active.from === decorated.source &&
          active.to === decorated.target;
        if (!isExecuted && !isActive) return decorated;
        return {
          ...decorated,
          animated: isActive,
          style: {
            ...(decorated.style ?? {}),
            stroke: isActive ? "var(--primary)" : "#10b981",
            strokeWidth: isActive ? 2 : 1.75,
          },
        };
      })
    : edges;
  const withVars = [...styledEdges, ...variableArtifacts.edges];

  // When a node is selected, emphasise every edge touching it — incoming,
  // outgoing, and the variable pill edges — so its data/flow connections
  // stand out from the rest of the graph.
  const selectedIds = new Set(
    nodes.filter((n) => n.selected).map((n) => n.id),
  );
  const highlight = (list: Edge[]): Edge[] => {
    if (selectedIds.size === 0) return list;
    return list.map((e) => {
      const connected =
        selectedIds.has(e.source) || selectedIds.has(e.target);
      if (!connected) {
        // Dim unrelated edges so the highlighted ones pop.
        return {
          ...e,
          style: { ...(e.style ?? {}), opacity: 0.15 },
        };
      }
      return {
        ...e,
        zIndex: Math.max((e.zIndex as number) ?? 0, 1001),
        style: {
          ...(e.style ?? {}),
          opacity: 1,
          strokeWidth: 2.5,
          stroke: "var(--primary)",
        },
      };
    });
  };

  if (!entryStepId) return highlight(withVars);
  if (!nodes.some((n) => n.id === entryStepId)) return highlight(withVars);
  const startEdge: Edge = {
    id: START_EDGE_ID,
    source: START_NODE_ID,
    target: entryStepId,
    type: "step",
    selectable: false,
    deletable: false,
    focusable: false,
    style: { strokeDasharray: "4 3", opacity: 0.7 },
  };
  return highlight([startEdge, ...withVars]);
};
