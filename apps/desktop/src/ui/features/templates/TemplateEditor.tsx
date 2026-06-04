import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type OnConnectStartParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  AlertTriangle,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Check,
  ChevronDown,
  Columns2,
  Download,
  FileImage,
  FileJson,
  Frame,
  Grid3x3,
  Maximize2,
  Minimize2,
  NotebookPen,
  Play,
  Save,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Menu } from "@base-ui/react/menu";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  menuItemClass,
  menuPopupClass,
} from "../explorer/menus/menu-styles";
import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import type { TemplateVariableView } from "@shared/wf/types";
import { transitionTypable } from "@shared/wf/port-accepts";
import type {
  GroupLayout,
  NodePositionEntry,
  StickyNoteLayout,
  TemplateLayout,
} from "@shared/wf/layout";
import ToolbarButton from "../../components/ToolbarButton";
import { useT } from "../../i18n";
import { useServices } from "../../di/services-provider";
import {
  kindForArtifactSchema,
  type ArtifactKind,
  type NodeSpecView,
  type StepKindId,
  type TemplateDraft,
  type TemplateStepDraft,
  type TemplateVariableDraft,
  type TemplateView,
} from "../../../domain/workflow/types";
import StepNode, {
  NotesVisibilityProvider,
} from "../../components/templates/StepNode";
import StartNode from "../../components/templates/StartNode";
import VariableNode from "../../components/templates/VariableNode";
import GroupNode, {
  GroupActionsProvider,
} from "../../components/templates/GroupNode";
import StickyNoteNode, {
  StickyNoteActionsProvider,
} from "../../components/templates/StickyNoteNode";
import SelfLoopEdge from "../../components/templates/SelfLoopEdge";
import StepEdge from "../../components/templates/StepEdge";
import {
  STEP_KIND_CATALOG,
  getKindMeta,
  type StepKindMeta,
} from "../../components/templates/step-kinds";
import { STEP_KIND_DND_MIME } from "./picker-dnd";
import EdgeDropSuggestions, {
  type EdgeDropSuggestion,
} from "../../components/templates/EdgeDropSuggestions";
import NodesPickerMenu from "./NodesPickerMenu";
import VariablesPickerMenu from "./VariablesPickerMenu";
import VariableEditorModal from "./VariableEditorModal";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import useSkills from "../../hooks/useSkills";
import useArtifactSchemas from "../../hooks/useArtifactSchemas";
import useWorkflowTemplates from "../../hooks/useWorkflowTemplates";
import type { EditorUri, WorkbenchApi } from "../../workbench/types";
import {
  setTemplateEditorGridSnap,
  setTemplateEditorInspectorWidth,
  useTemplateEditorGridSnap,
  useTemplateEditorInspectorWidth,
} from "../../workbench/store";
import {
  INSPECTOR_WIDTH_MAX_PX,
  INSPECTOR_WIDTH_MIN_PX,
} from "../../workbench/prefs";
import { runUriFor } from "../runs/run-uri";
import {
  fromRefFromTemplateUri,
  refFromTemplateUri,
  templateUriFor,
} from "./template-uri";
import {
  useRegisterTemplateCanvas,
  type SelectedEdgeInfo,
  type TemplateCanvasHandle,
} from "../../stores/template-canvas-store";
import { onSkillCreated } from "../skills/events";
import { postImportStore } from "./post-import-store";
import TemplateMissingDepsModal from "./TemplateMissingDepsModal";
import TemplateTitleBar from "./TemplateTitleBar";
import TemplateInspectorView from "./TemplateInspectorView";
import TemplateSaveMissingModal, {
  type RequiredField as MissingRequiredField,
} from "./TemplateSaveMissingModal";
import LaunchRunDialog from "./LaunchRunDialog";
import {
  collectMissingTemplateDeps,
  totalMissing as totalMissingDeps,
} from "../../../application/use-cases/collect-missing-template-deps";
import { useLayoutAutosave } from "./useLayoutAutosave";
import {
  buildPngFileName,
  buildSvgFileName,
  renderWorkflowPng,
  renderWorkflowSvg,
} from "./exportWorkflowSvg";
import type { RunOverlay } from "./run-overlay";

const nodeTypes = {
  step: StepNode,
  start: StartNode,
  variable: VariableNode,
  group: GroupNode,
  stickyNote: StickyNoteNode,
} as const;
const edgeTypes = { selfLoop: SelfLoopEdge, step: StepEdge } as const;

const START_NODE_ID = "__start__";
const START_EDGE_ID = "__start-edge__";
const VARIABLE_NODE_PREFIX = "__var-";
const VARIABLE_EDGE_PREFIX = "__var-edge-";
const GROUP_NODE_PREFIX = "grp-";
const STICKY_NODE_PREFIX = "note-";
const GROUP_MIN_DRAW_SIZE = 24;
// Marge intérieure d'un groupe : espace entre le bord du groupe et la bbox
// des steps qu'il contient. Utilisé pour le placement initial des enfants
// (lors du draw-to-create) et pour le resize auto-layout / drop.
const GROUP_PADDING = 24;

const isSyntheticId = (id: string): boolean =>
  id === START_NODE_ID ||
  id === START_EDGE_ID ||
  id.startsWith(VARIABLE_NODE_PREFIX) ||
  id.startsWith(VARIABLE_EDGE_PREFIX);

type EdgeData = { isLoop: boolean; order?: number };

type ByKind = ReadonlyMap<StepKindId, NodeSpecView>;

/**
 * Step kinds whose loop edges are *auto-loops* (the orchestrator re-invokes
 * automatically on the pinned `fromPort`). These keep their `fromPort` on save;
 * loop edges from any other kind are human-feedback loops and drop it. Mirrors
 * `AUTO_LOOP_WHITELIST` in the main-process `validateAutoLoopWhitelist`.
 */
const AUTO_LOOP_SOURCE_KINDS: ReadonlySet<string> = new Set([
  "llm.judge",
  "format.validate",
]);

const makeStepId = (kind: string, counter: number) =>
  `${kind.replace(/\./g, "-")}-${counter}`;

const highestCounterForKind = (
  kind: string,
  ids: ReadonlyArray<string>,
): number => {
  const prefix = `${kind.replace(/\./g, "-")}-`;
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
};

const buildDefaultStep = (
  kind: StepKindMeta,
  id: string,
): TemplateStepDraft => ({
  id,
  name: kind.label,
  kind: kind.id,
  actorRole: kind.defaultActor,
  humanGateRequired: kind.defaultHumanGateRequired,
  config: kind.buildDefaultConfig(),
});

const edgeStyle = (isLoop: boolean): Partial<Edge> => ({
  animated: isLoop,
  style: isLoop ? { strokeDasharray: "6 4" } : undefined,
  label: isLoop ? "Human validation" : undefined,
});

const minimapNodeColor = (node: Node): string => {
  if (node.type === "start") return "var(--primary)";
  if (node.type === "variable") return "var(--muted-foreground)";
  return node.selected ? "var(--primary)" : "var(--card)";
};

const minimapNodeStrokeColor = (node: Node): string =>
  node.selected ? "var(--primary)" : "var(--border)";

const computeStepLevels = (
  stepIds: ReadonlyArray<string>,
  transitions: ReadonlyArray<{ from: string; to: string; isLoop: boolean }>,
  entryStepId: string,
): Map<string, number> => {
  const forward = new Map<string, string[]>();
  for (const t of transitions) {
    if (t.isLoop || t.from === t.to) continue;
    const arr = forward.get(t.from) ?? [];
    arr.push(t.to);
    forward.set(t.from, arr);
  }
  const level = new Map<string, number>();
  const queue: Array<{ id: string; lv: number }> = [{ id: entryStepId, lv: 0 }];
  while (queue.length > 0) {
    const { id, lv } = queue.shift()!;
    if ((level.get(id) ?? -1) >= lv) continue;
    level.set(id, lv);
    for (const next of forward.get(id) ?? []) {
      queue.push({ id: next, lv: lv + 1 });
    }
  }
  for (const id of stepIds) {
    if (!level.has(id)) level.set(id, 0);
  }
  return level;
};

const groupLayoutToNode = (g: GroupLayout): Node => ({
  id: g.id,
  type: "group",
  position: { x: g.position.x, y: g.position.y },
  width: g.size.width,
  height: g.size.height,
  data: { label: g.label ?? "" },
  zIndex: -1,
});

const stickyNoteLayoutToNode = (s: StickyNoteLayout): Node => ({
  id: s.id,
  type: "stickyNote",
  position: { x: s.position.x, y: s.position.y },
  width: s.size.width,
  height: s.size.height,
  data: { text: s.text, color: s.color ?? "yellow" },
  zIndex: -1,
});

// Position absolue d'une node : si elle est enfant d'un groupe, sa `position`
// xyflow est relative au parent — il faut ajouter l'absolu du parent. Les
// groupes ne s'imbriquent pas (un seul niveau), donc la récursion termine
// en pratique en 1 saut, mais on l'écrit générale pour rester safe.
const absPosOf = (
  node: Node,
  byId: ReadonlyMap<string, Node>,
): { x: number; y: number } => {
  if (!node.parentId) return node.position;
  const parent = byId.get(node.parentId);
  if (!parent) return node.position;
  const parentAbs = absPosOf(parent, byId);
  return {
    x: parentAbs.x + node.position.x,
    y: parentAbs.y + node.position.y,
  };
};

const stepCenterAbs = (
  n: Node,
  byId: ReadonlyMap<string, Node>,
): { x: number; y: number } => {
  const w = n.measured?.width ?? n.width ?? AUTO_LAYOUT_DEFAULT_WIDTH;
  const h = n.measured?.height ?? n.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT;
  const p = absPosOf(n, byId);
  return { x: p.x + w / 2, y: p.y + h / 2 };
};

const groupBounds = (
  g: Node,
): { x: number; y: number; w: number; h: number } => {
  const w = g.width ?? (g.style?.width as number | undefined) ?? 0;
  const h = g.height ?? (g.style?.height as number | undefined) ?? 0;
  return { x: g.position.x, y: g.position.y, w, h };
};

// Trouve le groupe dont le bbox absolu contient le point passé. Si plusieurs
// groupes contiennent le point (overlap), on prend le dernier de l'ordre de
// la liste (= dessiné en dernier visuellement). Renvoie `null` sinon.
const findContainingGroupId = (
  point: { x: number; y: number },
  groups: ReadonlyArray<Node>,
): string | null => {
  let hit: string | null = null;
  for (const g of groups) {
    const { x, y, w, h } = groupBounds(g);
    if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) {
      hit = g.id;
    }
  }
  return hit;
};

// Grow-only : assure que `groupId` enclos tous ses enfants step avec une
// marge `GROUP_PADDING`. Si des enfants débordent à gauche/au-dessus, on
// décale le groupe en monde et on compense les positions locales des
// enfants pour préserver leurs coordonnées monde. Ne rétrécit jamais —
// seul l'auto-layout, qui recompose tout, autorise le shrink.
const resizeGroupToFit = (
  nodes: ReadonlyArray<Node>,
  groupId: string,
): Node[] => {
  const group = nodes.find((n) => n.id === groupId);
  if (!group) return [...nodes];
  const children = nodes.filter(
    (n) => n.parentId === groupId && n.type === "step",
  );
  if (children.length === 0) return [...nodes];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of children) {
    const w = c.measured?.width ?? AUTO_LAYOUT_DEFAULT_WIDTH;
    const h = c.measured?.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT;
    if (c.position.x < minX) minX = c.position.x;
    if (c.position.y < minY) minY = c.position.y;
    if (c.position.x + w > maxX) maxX = c.position.x + w;
    if (c.position.y + h > maxY) maxY = c.position.y + h;
  }

  const currentWidth = group.width ?? 0;
  const currentHeight = group.height ?? 0;
  const shiftX = Math.min(0, minX - GROUP_PADDING);
  const shiftY = Math.min(0, minY - GROUP_PADDING);
  const rightLocal = Math.max(currentWidth, maxX + GROUP_PADDING);
  const bottomLocal = Math.max(currentHeight, maxY + GROUP_PADDING);
  const newWidth = rightLocal - shiftX;
  const newHeight = bottomLocal - shiftY;

  if (
    shiftX === 0 &&
    shiftY === 0 &&
    newWidth === currentWidth &&
    newHeight === currentHeight
  ) {
    return [...nodes];
  }

  return nodes.map((n) => {
    if (n.id === groupId) {
      return {
        ...n,
        position: {
          x: group.position.x + shiftX,
          y: group.position.y + shiftY,
        },
        width: newWidth,
        height: newHeight,
      };
    }
    if (n.parentId === groupId) {
      return {
        ...n,
        position: { x: n.position.x - shiftX, y: n.position.y - shiftY },
      };
    }
    return n;
  });
};

const templateToGraph = (
  tpl: TemplateView,
  layout: TemplateLayout | null,
): { nodes: Node[]; edges: Edge[]; entryStepId: string } => {
  const levels = computeStepLevels(
    tpl.steps.map((s) => s.id),
    tpl.transitions,
    tpl.entryStep,
  );
  const yIndexByLevel = new Map<number, number>();

  const groupNodes: Node[] = (layout?.groups ?? []).map(groupLayoutToNode);
  const groupById = new Map(groupNodes.map((g) => [g.id, g]));
  const noteNodes: Node[] = (layout?.stickyNotes ?? []).map(
    stickyNoteLayoutToNode,
  );

  const stepNodes: Node[] = tpl.steps.map((s) => {
    const lv = levels.get(s.id) ?? 0;
    const yIdx = yIndexByLevel.get(lv) ?? 0;
    yIndexByLevel.set(lv, yIdx + 1);
    const stepData: TemplateStepDraft = {
      id: s.id,
      name: s.name,
      kind: s.kind,
      actorRole: s.actorRole,
      config: s.config ?? {},
      humanGateRequired: s.humanGateRequired,
      writesTo: s.writesTo,
      readsFrom: s.readsFrom,
      note: s.note,
    };
    const saved = layout?.positions[s.id];
    if (saved && saved.parentId && groupById.has(saved.parentId)) {
      // Layout au nouveau format : position déjà relative au parent.
      return {
        id: s.id,
        type: "step",
        position: { x: saved.x, y: saved.y },
        parentId: saved.parentId,
        data: { ...stepData, isEntry: s.id === tpl.entryStep },
      };
    }
    // Fallback : position absolue (anciens layouts ou nouveau step sans
    // sauvegarde). On détecte l'appartenance par containment du centre du
    // step dans une bbox de groupe, puis on traduit en coords locales si
    // un parent est trouvé — migration silencieuse vers le modèle parentId.
    const absPos = saved
      ? { x: saved.x, y: saved.y }
      : { x: 80 + lv * 280, y: 80 + yIdx * 140 };
    const center = {
      x: absPos.x + AUTO_LAYOUT_DEFAULT_WIDTH / 2,
      y: absPos.y + AUTO_LAYOUT_DEFAULT_HEIGHT / 2,
    };
    const parentId = findContainingGroupId(center, groupNodes);
    if (parentId) {
      const parent = groupById.get(parentId)!;
      return {
        id: s.id,
        type: "step",
        position: {
          x: absPos.x - parent.position.x,
          y: absPos.y - parent.position.y,
        },
        parentId,
        data: { ...stepData, isEntry: s.id === tpl.entryStep },
      };
    }
    return {
      id: s.id,
      type: "step",
      position: absPos,
      data: { ...stepData, isEntry: s.id === tpl.entryStep },
    };
  });
  const edges: Edge[] = tpl.transitions.map((t, i) => {
    const isSelfLoop = t.from === t.to;
    return {
      id: `e-${t.from}-${t.to}-${i}`,
      source: t.from,
      sourceHandle: t.fromPort,
      target: t.to,
      targetHandle: t.toPort,
      type: isSelfLoop ? "selfLoop" : "step",
      data: {
        isLoop: t.isLoop,
        ...(typeof t.order === "number" ? { order: t.order } : {}),
      },
      zIndex: isSelfLoop ? 1000 : undefined,
      ...edgeStyle(t.isLoop),
    };
  });
  // React Flow exige que les parents apparaissent AVANT leurs enfants dans
  // le tableau de nodes (sinon le mounting des enfants se fait sans ancrage
  // correct). Comme les groupes sont déjà en tête, et qu'on ne nest pas les
  // groupes, l'ordre `[groupes…, steps…]` satisfait l'invariant.
  return {
    nodes: [...groupNodes, ...noteNodes, ...stepNodes],
    edges,
    entryStepId: tpl.entryStep,
  };
};

const AUTO_LAYOUT_BASE_X = 80;
const AUTO_LAYOUT_BASE_Y = 80;
const AUTO_LAYOUT_VERTICAL_GAP = 60;
const AUTO_LAYOUT_HORIZONTAL_GAP = 80;
const AUTO_LAYOUT_DEFAULT_WIDTH = 220;
const AUTO_LAYOUT_DEFAULT_HEIGHT = 120;

type AutoLayoutMode = "vertical" | "horizontal" | "two-columns";

// Ordering used for every auto-layout: BFS from the entry step along
// non-loop transitions, then any unreachable steps appended in their
// existing array order — keeps the visible flow direction stable.
const computeAutoLayoutOrder = (
  nodes: ReadonlyArray<Node>,
  edges: ReadonlyArray<Edge>,
  entryStepId: string | null,
): string[] => {
  const stepIds = nodes.map((n) => n.id);
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if ((e.data as EdgeData | undefined)?.isLoop) continue;
    if (e.source === e.target) continue;
    const arr = adj.get(e.source) ?? [];
    arr.push(e.target);
    adj.set(e.source, arr);
  }
  const visited = new Set<string>();
  const order: string[] = [];
  const start =
    entryStepId && stepIds.includes(entryStepId) ? entryStepId : stepIds[0];
  if (start) {
    const queue: string[] = [start];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      order.push(id);
      for (const next of adj.get(id) ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }
  }
  for (const id of stepIds) {
    if (!visited.has(id)) order.push(id);
  }
  return order;
};

type SizedItem = { id: string; width: number; height: number };

// Place une liste d'items dimensionnés selon le mode choisi, à partir
// de l'origine (baseX, baseY). Renvoie une map id → position. Pure : ne
// dépend pas des constantes BASE_X/Y → réutilisable pour layouter à
// l'intérieur d'un groupe (origine = padding) ou au niveau supernode
// (origine = base globale du canvas).
const layoutLine = (
  items: ReadonlyArray<SizedItem>,
  order: ReadonlyArray<string>,
  mode: AutoLayoutMode,
  baseX: number,
  baseY: number,
): Map<string, { x: number; y: number }> => {
  const sizeById = new Map(items.map((i) => [i.id, i]));
  const widthOf = (id: string) =>
    sizeById.get(id)?.width ?? AUTO_LAYOUT_DEFAULT_WIDTH;
  const heightOf = (id: string) =>
    sizeById.get(id)?.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT;
  const positions = new Map<string, { x: number; y: number }>();

  if (mode === "vertical") {
    let y = baseY;
    for (const id of order) {
      positions.set(id, { x: baseX, y });
      y += heightOf(id) + AUTO_LAYOUT_VERTICAL_GAP;
    }
  } else if (mode === "horizontal") {
    let x = baseX;
    for (const id of order) {
      positions.set(id, { x, y: baseY });
      x += widthOf(id) + AUTO_LAYOUT_HORIZONTAL_GAP;
    }
  } else {
    const columnXOffset =
      AUTO_LAYOUT_DEFAULT_WIDTH + AUTO_LAYOUT_HORIZONTAL_GAP;
    let y = baseY;
    order.forEach((id, idx) => {
      const col = idx % 2;
      positions.set(id, { x: baseX + col * columnXOffset, y });
      y += heightOf(id) + AUTO_LAYOUT_VERTICAL_GAP;
    });
  }
  return positions;
};

const nodeToSized = (n: Node): SizedItem => ({
  id: n.id,
  width: n.measured?.width ?? AUTO_LAYOUT_DEFAULT_WIDTH,
  height: n.measured?.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT,
});

const resolveStepSpec = (
  step: TemplateStepDraft,
  byKind: ByKind,
  variables?: ReadonlyArray<TemplateVariableDraft>,
  subTemplates?: ReadonlyMap<string, ReadonlyArray<TemplateVariableView>>,
): NodeSpecView | null => {
  const base = byKind.get(step.kind);
  if (!base) return null;
  return resolveNodeSpec(step.kind, step.config, base, {
    variables,
    subTemplates,
  });
};

type PendingConnect = {
  fromNodeId: string;
  handleType: "source" | "target";
  handleId: string | null;
  popupPos: { x: number; y: number };
  flowPos: { x: number; y: number };
};

type Props = {
  readonly uri: EditorUri;
  readonly api: WorkbenchApi;
  /**
   * When set, the editor renders in view-run mode: all mutating affordances
   * are disabled, the layout is not auto-saved, and each step node receives
   * an `executionOverlay` derived from `runOverlay.byStepId`.
   */
  readonly runOverlay?: RunOverlay;
};

const TemplateEditorInner = ({ uri, api, runOverlay }: Props) => {
  const isViewRun = runOverlay !== undefined;
  const t = useT();
  const services = useServices();
  const queryClient = useQueryClient();
  const rf = useReactFlow();
  const { screenToFlowPosition } = rf;
  const specs = useNodeSpecs();

  const editingRef = refFromTemplateUri(uri);
  const fromRef = fromRefFromTemplateUri(uri);
  const isNew = editingRef === null;

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [version, setVersion] = useState("v1");
  const [description, setDescription] = useState("");

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [entryStepId, setEntryStepId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [variables, setVariables] = useState<
    ReadonlyArray<TemplateVariableDraft>
  >([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline rename (TemplateTitleBar) — met à jour l'état local ET persiste le
  // nouveau nom en base via `renameWorkflowTemplate` (rename-in-place : ne
  // touche que la colonne `name`, sans re-valider toute la structure ni écrire
  // les éventuelles éditions structurelles non sauvegardées). Pour un template
  // « nouveau »/dupliqué (editingRef null, pas encore de ligne), on ne persiste
  // pas : le nom sera écrit au premier Save qui crée la ligne. En mode view-run,
  // ce callback n'est pas branché (handle.setName est un noop).
  const persistName = useCallback(
    (next: string) => {
      setName(next);
      if (isViewRun || editingRef === null) return;
      const ref = editingRef;
      void (async () => {
        try {
          await services.renameWorkflowTemplate({
            templateRef: ref,
            newName: next,
          });
          await queryClient.invalidateQueries({ queryKey: ["templates"] });
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    },
    [isViewRun, editingRef, services, queryClient],
  );
  const [loading, setLoading] = useState<boolean>(!isNew || Boolean(fromRef));
  // Layout chargé une seule fois à l'ouverture. Sert à initialiser les
  // positions de `templateToGraph` et le `defaultViewport` (uncontrolled) de
  // ReactFlow. La source de vérité ensuite est l'état xyflow ; le hook
  // `useLayoutAutosave` re-sérialise depuis `nodes` + `getViewport()` à
  // chaque évènement.
  const [initialLayout, setInitialLayout] = useState<TemplateLayout | null>(
    null,
  );
  const [layoutSaveError, setLayoutSaveError] = useState<string | null>(null);

  const [pendingConnect, setPendingConnect] = useState<PendingConnect | null>(
    null,
  );

  // État de l'outil "créer un groupe". Tant que `true`, un overlay capture
  // les événements pointeur au-dessus du canvas et trace un rectangle qui
  // devient une node de type "group" au mouseup.
  const [groupDrawingMode, setGroupDrawingMode] = useState(false);

  type LaunchState = {
    text: string;
    busy: boolean;
    error: string | null;
  };
  const [launch, setLaunch] = useState<LaunchState | null>(null);
  const [notesVisible, setNotesVisible] = useState<boolean>(false);
  // Full-app maximize: when true, the editor portals itself just under the
  // window title bar to cover the activity bar + dock. Escape exits.
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  useEffect(() => {
    if (!isMaximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMaximized(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMaximized]);

  // Grid snap (spec template-editor-grid-snap) — réglage global utilisateur
  // persisté dans WorkbenchPrefs, pas attaché au template.
  const gridSnap = useTemplateEditorGridSnap();

  // Largeur de l'overlay Inspector (px). Persistée globalement dans
  // WorkbenchPrefs ; pendant un drag on bypass la persistance via un state
  // local (`inspectorDragWidth`) pour éviter une écriture localStorage par
  // pixel. Commit au pointerup.
  const persistedInspectorWidth = useTemplateEditorInspectorWidth();
  const [inspectorDragWidth, setInspectorDragWidth] = useState<number | null>(
    null,
  );
  const inspectorWidth = inspectorDragWidth ?? persistedInspectorWidth;
  const inspectorResizeRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const onInspectorResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      inspectorResizeRef.current = {
        startX: e.clientX,
        startWidth: persistedInspectorWidth,
      };
      setInspectorDragWidth(persistedInspectorWidth);
    },
    [persistedInspectorWidth],
  );

  const onInspectorResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ref = inspectorResizeRef.current;
      if (!ref) return;
      // Overlay ancré à droite : déplacer le curseur vers la gauche
      // (delta négatif sur clientX) doit AGRANDIR la largeur.
      const delta = ref.startX - e.clientX;
      const raw = ref.startWidth + delta;
      const next = Math.min(
        INSPECTOR_WIDTH_MAX_PX,
        Math.max(INSPECTOR_WIDTH_MIN_PX, raw),
      );
      setInspectorDragWidth(next);
    },
    [],
  );

  const onInspectorResizeEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!inspectorResizeRef.current) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      inspectorResizeRef.current = null;
      setInspectorDragWidth((cur) => {
        if (cur !== null) setTemplateEditorInspectorWidth(cur);
        return null;
      });
    },
    [],
  );

  // Handoff state: when the user requests inline skill creation from the
  // StepInspector, we remember which step is waiting so that when the new
  // skill is saved we can auto-assign it and refocus this editor tab.
  const [pendingSkillForStep, setPendingSkillForStep] = useState<string | null>(
    null,
  );

  const handleRequestCreateSkill = useCallback(
    (stepId: string) => {
      setPendingSkillForStep(stepId);
      api.openEditor("skill://new", { focus: true });
    },
    [api],
  );

  // Subscribe to skill:created events. When a handoff is pending, auto-assign
  // the newly created skill to the waiting step and refocus the template tab.
  useEffect(() => {
    return onSkillCreated((ref) => {
      if (!pendingSkillForStep) return;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== pendingSkillForStep || n.type !== "step") return n;
          const data = n.data;
          const config = (data["config"] ?? {}) as Record<string, unknown>;
          return {
            ...n,
            data: { ...data, config: { ...config, skillRef: ref } },
          };
        }),
      );
      api.openEditor(uri, { focus: true });
      setPendingSkillForStep(null);
    });
  }, [pendingSkillForStep, api, uri]);

  // Available skill refs / artifact kinds — used to detect missing deps on
  // imported templates. Derived from the react-query caches so an external
  // mutation (skill saved, artifact type created, …) propagates without
  // re-mounting this editor.
  const { skills: availableSkills } = useSkills();
  const { types: availableArtifactSchemas } = useArtifactSchemas();
  // `workflow.call` ports are derived from the referenced sub-template's
  // interface variables, so feed `resolveNodeSpec` a ref→variables map built
  // from the cached template list. Used by `resolveStepSpec` for canvas
  // handles, `isValidConnection`, and save-time port validation alike — without
  // it a `workflow.call` reads as portless (`[∅]`) and its edges are rejected.
  const { templates: availableTemplates } = useWorkflowTemplates();
  const subTemplates = useMemo(() => {
    const map = new Map<string, ReadonlyArray<TemplateVariableView>>();
    for (const tpl of availableTemplates) {
      map.set(
        `${tpl.id}@${tpl.version}`,
        tpl.variables.map((v) => ({
          name: v.name,
          kind: v.kind,
          role: v.role,
          description: v.description,
          defaultValue: v.defaultValue,
        })),
      );
    }
    return map;
  }, [availableTemplates]);
  const availableSkillRefs = useMemo(
    () => new Set(availableSkills.map((s) => s.ref)),
    [availableSkills],
  );
  const availableArtifactKinds = useMemo(
    () =>
      new Set(
        availableArtifactSchemas.map((t) => {
          if (t.source.kind === "user") return `user:${t.id}@${t.version}`;
          if (t.source.kind === "plugin")
            return `plugin:${t.source.pluginId}:${t.id}@${t.version}`;
          return `${t.id}@${t.version}`;
        }),
      ),
    [availableArtifactSchemas],
  );
  // Resolver consumed by `transitionTypable` / `portAccepts` for §2 covariance
  // (e.g. a `Url` producer flows into a `String` port) and §5 content-addressed
  // equality (two records with the same `structuralHash` are interchangeable).
  // Built from the cached schema list — TanStack-Query refetches it on every
  // relevant mutation so the editor reacts without a remount.
  const refinementResolver = useMemo(() => {
    type Entry = { extends: ArtifactKind | null; structuralHash: string };
    const byKindIndex = new Map<string, Entry>();
    for (const t of availableArtifactSchemas) {
      byKindIndex.set(kindForArtifactSchema(t), {
        extends: t.extends ?? null,
        structuralHash: t.structuralHash,
      });
    }
    return (kind: string) => byKindIndex.get(kind) ?? null;
  }, [availableArtifactSchemas]);
  const [missingDepsModalOpen, setMissingDepsModalOpen] = useState(false);

  const [missingFieldsModal, setMissingFieldsModal] = useState<{
    fields: ReadonlyArray<MissingRequiredField>;
  } | null>(null);

  type VariableModalState =
    | { open: false }
    | { open: true; mode: "create" }
    | { open: true; mode: "edit"; variable: TemplateVariableDraft };
  const [variableModal, setVariableModal] = useState<VariableModalState>({
    open: false,
  });

  const counterRef = useRef(0);
  const flowWrapperRef = useRef<HTMLDivElement>(null);
  const connectingFromRef = useRef<{
    nodeId: string;
    handleType: "source" | "target";
    handleId: string | null;
  } | null>(null);
  // Tracé en cours d'un groupe (entre pointerdown et pointerup de l'overlay).
  const groupDrawingRef = useRef<{
    id: string;
    startFlow: { x: number; y: number };
  } | null>(null);

  const currentDraft = useMemo<{
    steps: ReadonlyArray<TemplateStepDraft>;
  } | null>(() => {
    const steps: TemplateStepDraft[] = nodes
      .filter((n) => n.type === "step")
      .map((n) => {
        const { isEntry: _isEntry, ...rest } =
          n.data as unknown as TemplateStepDraft & {
            isEntry: boolean;
          };
        return rest;
      });
    return steps.length > 0 ? { steps } : null;
  }, [nodes]);

  const missingDeps = useMemo(() => {
    if (!currentDraft) return { skillRefs: [], artifactKinds: [] };
    return collectMissingTemplateDeps(
      {
        // Shape only `steps` is read by `collectMissingTemplateDeps`; the
        // narrow input lets us reuse the live `nodes` state without
        // round-tripping a full TemplateView.
        id: templateId,
        version,
        name,
        description,
        entryStep: entryStepId ?? "",
        exitSteps: [],
        steps: currentDraft.steps,
        transitions: [],
        variables,
        status: "draft",
      },
      {
        skillRefs: availableSkillRefs,
        artifactKinds: availableArtifactKinds,
      },
    );
  }, [
    currentDraft,
    templateId,
    version,
    name,
    description,
    entryStepId,
    variables,
    availableSkillRefs,
    availableArtifactKinds,
  ]);

  const hasMissingDeps = totalMissingDeps(missingDeps) > 0;

  // Track whether we've already consumed the "fresh import" flag for the
  // currently displayed ref, so the deps modal only auto-opens once even if
  // `hasMissingDeps` flips multiple times while the user creates/deletes
  // skills in another tab.
  const consumedFreshForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editingRef) return;
    if (consumedFreshForRef.current === editingRef) return;
    // Wait until the template + deps catalog have settled (i.e. at least one
    // step is loaded) before consuming the flag — otherwise we'd "consume"
    // the flag against an empty draft and never see the missing refs.
    if (loading || nodes.length === 0) return;
    consumedFreshForRef.current = editingRef;
    if (postImportStore.consume(editingRef) && hasMissingDeps) {
      setMissingDepsModalOpen(true);
    }
  }, [editingRef, loading, nodes.length, hasMissingDeps]);

  // Load an existing template by ref, or seed a new one from a "from" ref.
  useEffect(() => {
    const sourceRef = editingRef ?? fromRef;
    if (!sourceRef) {
      // Nouveau template (pas une copie) : on l'amorce avec une node
      // « User Input ». Tout workflow démarre par la capture d'une seed, donc
      // ce point d'entrée est toujours nécessaire — autant l'ajouter d'office.
      const kind = getKindMeta("user.input");
      if (kind) {
        const id = makeStepId(kind.id, 1);
        counterRef.current = Math.max(counterRef.current, 1);
        const step = buildDefaultStep(kind, id);
        setNodes([
          {
            id,
            type: "step",
            position: { x: 80, y: 80 },
            data: { ...step, isEntry: true },
          },
        ]);
        setEntryStepId(id);
        setSelectedNodeId(id);
      }
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        // Fetch en parallèle : une erreur sur le layout (purement
        // présentationnel) ne doit pas casser l'ouverture du template.
        const [tpl, layout] = await Promise.all([
          services.getWorkflowTemplate(sourceRef),
          services.getTemplateLayout(sourceRef).catch(() => null),
        ]);
        if (cancelled) return;
        const graph = templateToGraph(tpl, layout);
        if (editingRef) {
          setName(tpl.name);
          setTemplateId(tpl.id);
          setVersion(tpl.version);
        } else {
          setName(`${tpl.name} (copie)`);
          setTemplateId(`${tpl.id}-copy`);
          setVersion(tpl.version);
        }
        setDescription(tpl.description);
        setNodes(graph.nodes);
        setEdges(graph.edges);
        setEntryStepId(graph.entryStepId);
        setVariables(tpl.variables ?? []);
        setInitialLayout(layout);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingRef, fromRef, services]);

  const byKind: ByKind | null = specs.status === "ready" ? specs.byKind : null;

  const selectedStep = useMemo<TemplateStepDraft | null>(() => {
    if (!selectedNodeId) return null;
    const n = nodes.find((x) => x.id === selectedNodeId);
    return n ? (n.data as unknown as TemplateStepDraft) : null;
  }, [nodes, selectedNodeId]);

  const selectedEdgeInfo = useMemo<SelectedEdgeInfo | null>(() => {
    if (!selectedEdgeId) return null;
    const e = edges.find((x) => x.id === selectedEdgeId);
    if (!e) return null;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      isLoop: (e.data as EdgeData | undefined)?.isLoop ?? false,
    };
  }, [edges, selectedEdgeId]);

  const variableByName = useMemo(() => {
    const map = new Map<string, TemplateVariableDraft>();
    for (const v of variables) map.set(v.name, v);
    return map;
  }, [variables]);

  const variableArtifacts = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
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
    const pillYForPortIndex = (nodeY: number, portIdx: number) =>
      nodeY +
      headerHeight +
      1 +
      portColumnPaddingTop +
      portIdx * portRowHeight +
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
  }, [nodes, variableByName, byKind, variables, subTemplates]);

  const displayNodes = useMemo<Node[]>(() => {
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
  }, [nodes, entryStepId, variableArtifacts, runOverlay]);

  const displayEdges = useMemo<Edge[]>(() => {
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
    if (!entryStepId) return withVars;
    if (!nodes.some((n) => n.id === entryStepId)) return withVars;
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
    return [startEdge, ...withVars];
  }, [edges, entryStepId, nodes, variableArtifacts, runOverlay]);

  const persistLayout = useCallback(
    async (templateRef: string, layout: TemplateLayout) => {
      await services.saveTemplateLayout(templateRef, layout);
      setLayoutSaveError(null);
    },
    [services],
  );
  const layoutAutosave = useLayoutAutosave({
    // editingRef est null pour un template "nouveau" (création ou
    // duplication) tant que `handleSave` n'a pas créé la ligne — le hook
    // skip alors silencieusement la sauvegarde.
    // En mode view-run on désactive l'autosave : on ne veut pas que la
    // visualisation d'un run écrive dans le layout du template.
    templateRef: isViewRun ? null : editingRef,
    busy,
    nodes,
    isSynthetic: isSyntheticId,
    save: persistLayout,
    onError: (e) => {
      console.warn("[wf:templates] layout auto-save failed", e);
      setLayoutSaveError(e instanceof Error ? e.message : String(e));
    },
  });

  const handleClearAll = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0) return;
    const ok = window.confirm(
      "Effacer toutes les nodes et repartir de zéro ? Cette action n'est pas réversible tant que vous n'avez pas sauvegardé.",
    );
    if (!ok) return;
    setNodes([]);
    setEdges([]);
    setEntryStepId(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [nodes.length, edges.length]);

  // Auto-layout group-aware en deux passes :
  //   1. Pour chaque groupe : layout BFS des enfants en coords LOCALES à
  //      partir de (PADDING, PADDING). On en déduit la taille du groupe
  //      (= bbox des enfants + padding) — le groupe est resizé pour épouser
  //      son contenu.
  //   2. On traite chaque groupe et chaque step ungrouped comme un "supernode"
  //      avec sa taille calculée, puis on layoute ces supernodes au niveau
  //      global. La BFS au niveau supernode utilise les edges qui croisent
  //      une frontière de cluster (un edge intra-groupe ne compte pas pour
  //      l'ordre global).
  // Effet net : les groupes survivent à l'auto-layout — leurs membres restent
  // dedans et le groupe se redimensionne pour les contenir.
  const handleAutoLayout = useCallback(
    (mode: AutoLayoutMode) => {
      const allSteps = nodes.filter((n) => n.type === "step");
      if (allSteps.length === 0) return;
      const allGroups = nodes.filter((n) => n.type === "group");
      const groupIds = new Set(allGroups.map((g) => g.id));

      const childrenByGroup = new Map<string, Node[]>();
      const ungroupedSteps: Node[] = [];
      for (const s of allSteps) {
        if (s.parentId && groupIds.has(s.parentId)) {
          const arr = childrenByGroup.get(s.parentId) ?? [];
          arr.push(s);
          childrenByGroup.set(s.parentId, arr);
        } else {
          ungroupedSteps.push(s);
        }
      }

      type GroupSuper = {
        kind: "group";
        id: string;
        width: number;
        height: number;
        childLocalPositions: Map<string, { x: number; y: number }>;
      };
      type StepSuper = {
        kind: "step";
        id: string;
        width: number;
        height: number;
      };
      type Super = GroupSuper | StepSuper;
      const supers = new Map<string, Super>();

      for (const [groupId, children] of childrenByGroup) {
        const localOrder = computeAutoLayoutOrder(children, edges, entryStepId);
        const localPositions = layoutLine(
          children.map(nodeToSized),
          localOrder,
          mode,
          GROUP_PADDING,
          GROUP_PADDING,
        );
        let maxRight = 0;
        let maxBottom = 0;
        for (const child of children) {
          const p = localPositions.get(child.id);
          if (!p) continue;
          const w = child.measured?.width ?? AUTO_LAYOUT_DEFAULT_WIDTH;
          const h = child.measured?.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT;
          if (p.x + w > maxRight) maxRight = p.x + w;
          if (p.y + h > maxBottom) maxBottom = p.y + h;
        }
        supers.set(groupId, {
          kind: "group",
          id: groupId,
          width: maxRight + GROUP_PADDING,
          height: maxBottom + GROUP_PADDING,
          childLocalPositions: localPositions,
        });
      }
      for (const step of ungroupedSteps) {
        supers.set(step.id, {
          kind: "step",
          id: step.id,
          width: step.measured?.width ?? AUTO_LAYOUT_DEFAULT_WIDTH,
          height: step.measured?.height ?? AUTO_LAYOUT_DEFAULT_HEIGHT,
        });
      }

      // Map step → supernode pour résoudre les edges inter-clusters.
      const stepToSuper = new Map<string, string>();
      for (const [groupId, children] of childrenByGroup) {
        for (const c of children) stepToSuper.set(c.id, groupId);
      }
      for (const s of ungroupedSteps) stepToSuper.set(s.id, s.id);

      const superAdj = new Map<string, string[]>();
      for (const e of edges) {
        const sa = stepToSuper.get(e.source);
        const sb = stepToSuper.get(e.target);
        if (!sa || !sb || sa === sb) continue;
        if ((e.data as EdgeData | undefined)?.isLoop) continue;
        const arr = superAdj.get(sa) ?? [];
        arr.push(sb);
        superAdj.set(sa, arr);
      }

      const startSuper = entryStepId ? stepToSuper.get(entryStepId) : undefined;
      const superIds = Array.from(supers.keys());
      const visited = new Set<string>();
      const superOrder: string[] = [];
      const start =
        startSuper && supers.has(startSuper) ? startSuper : superIds[0];
      if (start) {
        const queue: string[] = [start];
        while (queue.length > 0) {
          const sid = queue.shift()!;
          if (visited.has(sid)) continue;
          visited.add(sid);
          superOrder.push(sid);
          for (const next of superAdj.get(sid) ?? []) {
            if (!visited.has(next)) queue.push(next);
          }
        }
      }
      for (const sid of superIds) {
        if (!visited.has(sid)) superOrder.push(sid);
      }

      const superSized: SizedItem[] = superOrder.map((sid) => {
        const sn = supers.get(sid)!;
        return { id: sid, width: sn.width, height: sn.height };
      });
      const superPositions = layoutLine(
        superSized,
        superOrder,
        mode,
        AUTO_LAYOUT_BASE_X,
        AUTO_LAYOUT_BASE_Y,
      );

      const next: Node[] = nodes.map((n) => {
        if (n.type === "group") {
          const sn = supers.get(n.id);
          const pos = superPositions.get(n.id);
          if (!sn || !pos || sn.kind !== "group") return n;
          return { ...n, position: pos, width: sn.width, height: sn.height };
        }
        if (n.type === "step") {
          const superId = stepToSuper.get(n.id);
          if (!superId) return n;
          const sn = supers.get(superId);
          if (!sn) return n;
          if (sn.kind === "group") {
            const local = sn.childLocalPositions.get(n.id);
            if (!local) return n;
            return { ...n, parentId: superId, position: local };
          }
          const pos = superPositions.get(superId);
          if (!pos) return n;
          const { parentId: _p, ...rest } = n;
          return { ...rest, position: pos };
        }
        return n;
      });
      // Invariant xyflow : parents avant enfants — l'ordre est déjà bon car
      // on a juste mappé les nodes sans changer leur séquence.
      setNodes(next);

      // Recentre la vue sur le bbox global de tous les supernodes placés.
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const sid of superOrder) {
        const p = superPositions.get(sid);
        const sn = supers.get(sid);
        if (!p || !sn) continue;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x + sn.width > maxX) maxX = p.x + sn.width;
        if (p.y + sn.height > maxY) maxY = p.y + sn.height;
      }
      if (Number.isFinite(minX)) {
        rf.setCenter((minX + maxX) / 2, (minY + maxY) / 2, {
          zoom: rf.getZoom(),
          duration: 300,
        });
      }
      // setNodes ne flush pas synchroniquement → le nodesRef interne du hook
      // sera mis à jour au prochain render, avant que le timer debounced ne
      // tire (~500 ms).
      layoutAutosave.scheduleSave();
    },
    [nodes, edges, entryStepId, layoutAutosave, rf],
  );

  const onGroupLabelChange = useCallback(
    (id: string, label: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const data = (n.data ?? {}) as { label?: string };
          return { ...n, data: { ...data, label } };
        }),
      );
      layoutAutosave.scheduleSave();
    },
    [layoutAutosave],
  );

  const onGroupDelete = useCallback(
    (id: string) => {
      // Extraction des enfants : leur position xyflow est relative au
      // groupe, il faut la traduire en absolue avant de retirer le parent —
      // sinon ils sautent à (group.x + step.x, group.y + step.y) puis à
      // (step.x, step.y) après reparenting, soit un offset perdu.
      setNodes((nds) => {
        const group = nds.find((n) => n.id === id);
        if (!group) return nds;
        const gx = group.position.x;
        const gy = group.position.y;
        return nds
          .filter((n) => n.id !== id)
          .map((n) => {
            if (n.parentId !== id) return n;
            const { parentId: _p, ...rest } = n;
            return {
              ...rest,
              position: { x: n.position.x + gx, y: n.position.y + gy },
            };
          });
      });
      layoutAutosave.scheduleSave();
    },
    [layoutAutosave],
  );

  const groupActions = useMemo(
    () => ({ onLabelChange: onGroupLabelChange, onDelete: onGroupDelete }),
    [onGroupLabelChange, onGroupDelete],
  );

  // ── Notes post-it (données purement présentationnelles, persistées dans le
  // layout via l'autosave debounced — cf. spec template-sticky-notes). ──
  const addStickyNote = useCallback(() => {
    // Id stable et unique parmi les notes existantes (pas de `Date.now()` —
    // garde l'idempotence et évite la collision avec une note rechargée).
    const maxNote = highestCounterForKind(
      "note",
      nodes.filter((n) => n.type === "stickyNote").map((n) => n.id),
    );
    const id = `${STICKY_NODE_PREFIX}${maxNote + 1}`;
    const W = 200;
    const H = 140;
    const wrapper = flowWrapperRef.current;
    const center = wrapper
      ? (() => {
          const rect = wrapper.getBoundingClientRect();
          return screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        })()
      : { x: 80 + W / 2, y: 80 + H / 2 };
    const newNote: Node = {
      id,
      type: "stickyNote",
      position: { x: center.x - W / 2, y: center.y - H / 2 },
      width: W,
      height: H,
      data: { text: "", color: "yellow" },
      zIndex: -1,
    };
    setNodes((nds) => [...nds, newNote]);
    layoutAutosave.scheduleSave();
  }, [nodes, screenToFlowPosition, layoutAutosave]);

  const onStickyTextChange = useCallback(
    (id: string, text: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...(n.data ?? {}), text } } : n,
        ),
      );
      layoutAutosave.scheduleSave();
    },
    [layoutAutosave],
  );

  const onStickyDelete = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      layoutAutosave.scheduleSave();
    },
    [layoutAutosave],
  );

  const onStickyResizeEnd = useCallback(() => {
    // NodeResizer ne déclenche pas `onNodeDragStop` : on programme le save
    // explicitement pour persister les nouvelles dimensions.
    layoutAutosave.scheduleSave();
  }, [layoutAutosave]);

  const stickyActions = useMemo(
    () => ({
      onTextChange: onStickyTextChange,
      onDelete: onStickyDelete,
      onResizeEnd: onStickyResizeEnd,
      // Flush au blur du textarea : si l'éditeur est fermé < 500 ms après la
      // dernière frappe, le timer debounce serait annulé au unmount sans ça.
      onCommit: () => void layoutAutosave.flushNow(),
      readOnly: isViewRun,
    }),
    [onStickyTextChange, onStickyDelete, onStickyResizeEnd, layoutAutosave, isViewRun],
  );

  const onOverlayPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!groupDrawingMode) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = `${GROUP_NODE_PREFIX}${Date.now()}`;
      groupDrawingRef.current = { id, startFlow: flow };
      const newGroup: Node = {
        id,
        type: "group",
        position: { x: flow.x, y: flow.y },
        width: 1,
        height: 1,
        data: { label: "", isDrawing: true },
        draggable: false,
        selectable: false,
        zIndex: -1,
      };
      setNodes((nds) => [...nds, newGroup]);
    },
    [groupDrawingMode, screenToFlowPosition],
  );

  const onOverlayPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drawing = groupDrawingRef.current;
      if (!drawing) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const x = Math.min(drawing.startFlow.x, flow.x);
      const y = Math.min(drawing.startFlow.y, flow.y);
      const w = Math.max(1, Math.abs(flow.x - drawing.startFlow.x));
      const h = Math.max(1, Math.abs(flow.y - drawing.startFlow.y));
      setNodes((nds) =>
        nds.map((n) =>
          n.id === drawing.id
            ? { ...n, position: { x, y }, width: w, height: h }
            : n,
        ),
      );
    },
    [screenToFlowPosition],
  );

  const onOverlayPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer déjà relâché */
      }
      const drawing = groupDrawingRef.current;
      groupDrawingRef.current = null;
      setGroupDrawingMode(false);
      if (!drawing) return;
      setNodes((nds) => {
        const grp = nds.find((n) => n.id === drawing.id);
        if (!grp) return nds;
        const w = grp.width ?? 0;
        const h = grp.height ?? 0;
        // Trop petit → considéré comme un clic accidentel : on jette.
        if (w < GROUP_MIN_DRAW_SIZE || h < GROUP_MIN_DRAW_SIZE) {
          return nds.filter((n) => n.id !== drawing.id);
        }
        // Finalise le groupe + adopte les steps dont le centre absolu tombe
        // dans son bbox. Adoption = parentId + position traduite en relatif.
        // Les steps déjà parentés à un autre groupe ne sont pas volés (cas
        // d'un draw qui recouvre partiellement un groupe existant).
        const byId = new Map(nds.map((n) => [n.id, n]));
        const groupAbsX = grp.position.x;
        const groupAbsY = grp.position.y;
        const finalized: Node[] = nds.map((n) => {
          if (n.id === drawing.id) {
            return {
              ...n,
              data: { ...((n.data ?? {}) as object), isDrawing: false },
              draggable: true,
              selectable: true,
            };
          }
          if (n.type !== "step" || n.parentId) return n;
          const center = stepCenterAbs(n, byId);
          const inside =
            center.x >= groupAbsX &&
            center.x <= groupAbsX + w &&
            center.y >= groupAbsY &&
            center.y <= groupAbsY + h;
          if (!inside) return n;
          return {
            ...n,
            parentId: drawing.id,
            position: {
              x: n.position.x - groupAbsX,
              y: n.position.y - groupAbsY,
            },
          };
        });
        // Réordonner : groupe avant ses enfants. On extrait le groupe et on
        // le replace juste devant ses enfants (par sécurité on met tous les
        // groupes en tête de tableau, ce qui satisfait l'invariant xyflow).
        const groups = finalized.filter((n) => n.type === "group");
        const others = finalized.filter((n) => n.type !== "group");
        return [...groups, ...others];
      });
      layoutAutosave.scheduleSave();
    },
    [layoutAutosave],
  );

  // Escape annule la création de groupe en cours.
  useEffect(() => {
    if (!groupDrawingMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const drawing = groupDrawingRef.current;
      groupDrawingRef.current = null;
      if (drawing) {
        setNodes((nds) => nds.filter((n) => n.id !== drawing.id));
      }
      setGroupDrawingMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [groupDrawingMode]);

  // Au drop d'un step : ré-évalue son parent selon le containment positionnel
  // de son centre absolu, traduit ses coords si reparenting, et auto-grow
  // les groupes affectés pour qu'ils enclosent leurs enfants avec padding.
  // Pour un drop de groupe, React Flow a déjà déplacé les enfants (parentId)
  // — il suffit de programmer la sauvegarde.
  const handleNodeDragStop = useCallback(
    (_e: unknown, dragged: Node) => {
      if (dragged.type !== "step") {
        layoutAutosave.onNodeDragStop();
        return;
      }
      setNodes((nds) => {
        const byId = new Map(nds.map((n) => [n.id, n]));
        const node = byId.get(dragged.id);
        if (!node) return nds;
        const absCenter = stepCenterAbs(node, byId);
        const groupsArr = nds.filter((n) => n.type === "group");
        const containingId = findContainingGroupId(absCenter, groupsArr);
        const currentParentId = node.parentId ?? null;

        if (containingId === currentParentId) {
          // Pas de reparenting : on auto-grow seulement le parent courant
          // (s'il y en a un) au cas où le step ait été poussé vers les bords.
          return currentParentId ? resizeGroupToFit(nds, currentParentId) : nds;
        }

        const next: Node[] = nds.map((n) => {
          if (n.id !== node.id) return n;
          const absPos = absPosOf(n, byId);
          if (containingId) {
            const parent = byId.get(containingId);
            if (!parent) return n;
            return {
              ...n,
              parentId: containingId,
              position: {
                x: absPos.x - parent.position.x,
                y: absPos.y - parent.position.y,
              },
            };
          }
          // Out of any group → on dé-parente et on remonte en absolu.
          const { parentId: _p, ...rest } = n;
          return { ...rest, position: absPos };
        });

        // Invariant xyflow : parents avant enfants. On replace tous les
        // groupes en tête (l'ordre relatif des groupes entre eux n'a pas
        // d'incidence puisqu'ils ne s'imbriquent pas).
        const groupsReordered = next.filter((n) => n.type === "group");
        const others = next.filter((n) => n.type !== "group");
        let result: Node[] = [...groupsReordered, ...others];

        if (currentParentId) result = resizeGroupToFit(result, currentParentId);
        if (containingId) result = resizeGroupToFit(result, containingId);
        return result;
      });
      layoutAutosave.onNodeDragStop();
    },
    [layoutAutosave],
  );

  const launchEntryStep = useMemo<TemplateStepDraft | null>(() => {
    if (!entryStepId) return null;
    const n = nodes.find((x) => x.id === entryStepId);
    if (!n) return null;
    const { isEntry: _isEntry, ...rest } =
      n.data as unknown as TemplateStepDraft & {
        isEntry: boolean;
      };
    return rest;
  }, [nodes, entryStepId]);

  const launchNeedsSeed = launchEntryStep?.kind === "user.input";

  const launchSeedKind = useMemo<ArtifactKind | null>(() => {
    if (!launchEntryStep || !byKind) return null;
    const spec = resolveStepSpec(launchEntryStep, byKind, variables, subTemplates);
    return (spec?.outputs[0]?.kind as ArtifactKind) ?? null;
  }, [launchEntryStep, byKind, variables, subTemplates]);

  const canLaunch =
    editingRef !== null && entryStepId !== null && !hasMissingDeps;

  const handleLaunchOpen = useCallback(() => {
    if (!canLaunch) return;
    setLaunch({ text: "", busy: false, error: null });
  }, [canLaunch]);

  const handleLaunchClose = useCallback(() => setLaunch(null), []);

  const handleLaunchSubmit = useCallback(async () => {
    if (!launch || !editingRef) return;
    if (launchNeedsSeed && launch.text.trim().length === 0) return;
    let seeds: ReadonlyArray<{ kind: ArtifactKind; content: string }> = [];
    if (launchNeedsSeed) {
      if (!launchSeedKind) {
        setLaunch({
          ...launch,
          error: "Impossible de déterminer le kind de seed pour ce template.",
        });
        return;
      }
      seeds = [{ kind: launchSeedKind, content: launch.text }];
    }
    setLaunch({ ...launch, busy: true, error: null });
    try {
      const result = await services.startWorkflow({
        templateRef: editingRef,
        seeds,
      });
      api.activateActivity("explorer");
      api.openEditor(runUriFor(result.instanceId), { focus: true });
      setLaunch(null);
    } catch (e) {
      setLaunch({
        ...launch,
        busy: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [launch, editingRef, launchNeedsSeed, launchSeedKind, services, api]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const filtered = changes.filter(
      (c) => !("id" in c) || !isSyntheticId(c.id),
    );
    setNodes((nds) => applyNodeChanges(filtered, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const filtered = changes.filter(
      (c) => !("id" in c) || !isSyntheticId(c.id),
    );
    setEdges((eds) => applyEdgeChanges(filtered, eds));
  }, []);

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => {
      if (!conn.source || !conn.target) return false;
      if (conn.source === conn.target) return true;
      if (!byKind) return false;
      const src = nodes.find((n) => n.id === conn.source);
      const tgt = nodes.find((n) => n.id === conn.target);
      if (!src || !tgt) return false;
      const srcStep = src.data as unknown as TemplateStepDraft;
      const tgtStep = tgt.data as unknown as TemplateStepDraft;
      const srcSpec = resolveStepSpec(srcStep, byKind, variables, subTemplates);
      const tgtSpec = resolveStepSpec(tgtStep, byKind, variables, subTemplates);
      if (!srcSpec || !tgtSpec) return false;
      if (
        !transitionTypable(srcSpec, tgtSpec, {
          fromPort: conn.sourceHandle ?? undefined,
          toPort: conn.targetHandle ?? undefined,
          resolver: refinementResolver,
        })
      ) {
        return false;
      }
      // Cardinality check: refuse a second incoming edge on a non-isList port.
      const targetPort = conn.targetHandle
        ? tgtSpec.inputs.find((p) => p.name === conn.targetHandle)
        : tgtSpec.inputs.length === 1
          ? tgtSpec.inputs[0]
          : undefined;
      if (targetPort && !targetPort.isList) {
        const existing = edges.some(
          (e) =>
            e.target === conn.target &&
            (e.targetHandle ?? null) === (conn.targetHandle ?? null) &&
            !(e.data as EdgeData | undefined)?.isLoop,
        );
        if (existing) return false;
      }
      return true;
    },
    [nodes, byKind, edges, variables, subTemplates],
  );

  const onConnect = useCallback((conn: Connection) => {
    const isSelfLoop = conn.source === conn.target;
    setEdges((eds) =>
      addEdge(
        {
          ...conn,
          id: `e-${conn.source}-${conn.target}-${Date.now()}`,
          type: isSelfLoop ? "selfLoop" : "step",
          data: { isLoop: isSelfLoop } satisfies EdgeData,
          zIndex: isSelfLoop ? 1000 : undefined,
          ...edgeStyle(isSelfLoop),
        },
        eds,
      ),
    );
  }, []);

  const onConnectStart = useCallback(
    (_event: unknown, params: OnConnectStartParams) => {
      if (!params.nodeId || !params.handleType) {
        connectingFromRef.current = null;
        return;
      }
      if (params.nodeId === START_NODE_ID) {
        connectingFromRef.current = null;
        return;
      }
      connectingFromRef.current = {
        nodeId: params.nodeId,
        handleType: params.handleType,
        handleId: params.handleId ?? null,
      };
    },
    [],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      const origin = connectingFromRef.current;
      connectingFromRef.current = null;
      if (!origin) return;
      if (connectionState.isValid) return;

      const point =
        "changedTouches" in event && event.changedTouches.length > 0
          ? event.changedTouches[0]
          : (event as MouseEvent);
      const clientX = point.clientX;
      const clientY = point.clientY;
      const rect = flowWrapperRef.current?.getBoundingClientRect();
      const popupPos = rect
        ? { x: clientX - rect.left, y: clientY - rect.top }
        : { x: clientX, y: clientY };
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });

      setPendingConnect({
        fromNodeId: origin.nodeId,
        handleType: origin.handleType,
        handleId: origin.handleId,
        popupPos,
        flowPos,
      });
    },
    [screenToFlowPosition],
  );

  const suggestions = useMemo<ReadonlyArray<EdgeDropSuggestion>>(() => {
    if (!pendingConnect || !byKind) return [];
    const origin = nodes.find((n) => n.id === pendingConnect.fromNodeId);
    if (!origin) return [];
    const originStep = origin.data as unknown as TemplateStepDraft;
    const originSpec = resolveStepSpec(originStep, byKind, variables, subTemplates);
    if (!originSpec) return [];
    const result: EdgeDropSuggestion[] = [];
    for (const kindMeta of STEP_KIND_CATALOG) {
      const base = byKind.get(kindMeta.id);
      if (!base) continue;
      const candidateConfig = kindMeta.buildDefaultConfig();
      const candidateSpec = resolveNodeSpec(
        kindMeta.id,
        candidateConfig,
        base,
        { variables, subTemplates },
      );
      const isCompatible =
        pendingConnect.handleType === "source"
          ? transitionTypable(originSpec, candidateSpec, {
              fromPort: pendingConnect.handleId ?? undefined,
              resolver: refinementResolver,
            })
          : transitionTypable(candidateSpec, originSpec, {
              toPort: pendingConnect.handleId ?? undefined,
              resolver: refinementResolver,
            });
      if (!isCompatible) continue;
      result.push({
        kind: kindMeta,
        resolvedOutputKind: candidateSpec.outputs[0]?.kind ?? null,
        resolvedInputKinds: candidateSpec.inputs[0]
          ? [...candidateSpec.inputs[0].kinds]
          : [],
      });
    }
    return result;
  }, [nodes, pendingConnect, byKind, variables, subTemplates]);

  const handleSuggestionPick = (suggestion: EdgeDropSuggestion) => {
    if (!pendingConnect) return;
    const { kind } = suggestion;
    const stepIds = nodes.filter((n) => n.type === "step").map((n) => n.id);
    const kindMax = highestCounterForKind(kind.id, stepIds);
    counterRef.current = Math.max(counterRef.current, kindMax) + 1;
    const newId = makeStepId(kind.id, counterRef.current);
    const step = buildDefaultStep(kind, newId);
    const isFirst = stepIds.length === 0;
    const newNode: Node = {
      id: newId,
      type: "step",
      position: { x: pendingConnect.flowPos.x, y: pendingConnect.flowPos.y },
      data: { ...step, isEntry: isFirst },
    };
    const sourceId =
      pendingConnect.handleType === "source"
        ? pendingConnect.fromNodeId
        : newId;
    const targetId =
      pendingConnect.handleType === "source"
        ? newId
        : pendingConnect.fromNodeId;
    const newEdge: Edge = {
      id: `e-${sourceId}-${targetId}-${Date.now()}`,
      source: sourceId,
      target: targetId,
      type: "step",
      data: { isLoop: false } satisfies EdgeData,
      ...edgeStyle(false),
    };
    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [...eds, newEdge]);
    if (isFirst) setEntryStepId(newId);
    setSelectedNodeId(newId);
    setSelectedEdgeId(null);
    setPendingConnect(null);
  };

  const addStep = useCallback(
    (kind: StepKindMeta, dropPosition?: { x: number; y: number }) => {
      const stepIds = nodes.filter((n) => n.type === "step").map((n) => n.id);
      const kindMax = highestCounterForKind(kind.id, stepIds);
      counterRef.current = Math.max(counterRef.current, kindMax) + 1;
      const id = makeStepId(kind.id, counterRef.current);
      const step = buildDefaultStep(kind, id);
      // Si une position en coordonnées flow est fournie (drop), on l'utilise
      // telle quelle. Sinon on place la node au centre du viewport visible.
      // La taille réelle n'est pas encore mesurée par xyflow (la node n'est
      // pas mountée), donc on recule de la moitié des dimensions par défaut
      // — assez proche pour que le recentrage visuel soit correct dans la
      // majorité des cas.
      const wrapper = flowWrapperRef.current;
      const position = dropPosition ?? (() => {
        if (!wrapper) return { x: 80, y: 80 };
        const rect = wrapper.getBoundingClientRect();
        const center = screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
        return {
          x: center.x - AUTO_LAYOUT_DEFAULT_WIDTH / 2,
          y: center.y - AUTO_LAYOUT_DEFAULT_HEIGHT / 2,
        };
      })();
      const isDrop = dropPosition !== undefined;
      setNodes((nds) => {
        const stepCount = nds.filter((n) => n.type === "step").length;
        const isFirst = stepCount === 0;
        const newNode: Node = {
          id,
          type: "step",
          position,
          data: { ...step, isEntry: isFirst, justDropped: isDrop },
        };
        if (isFirst) setEntryStepId(id);
        return [...nds, newNode];
      });
      // Clear the transient `justDropped` flag once the landing animation has
      // played, so a re-render (selection change, layout, etc.) does not replay
      // the burst.
      if (isDrop) {
        setTimeout(() => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === id &&
              (n.data as { justDropped?: boolean } | undefined)?.justDropped
                ? { ...n, data: { ...n.data, justDropped: false } }
                : n,
            ),
          );
        }, 550);
      }
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
    },
    [nodes, screenToFlowPosition],
  );

  const updateSelectedStep = useCallback(
    (next: TemplateStepDraft) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== selectedNodeId) return n;
          const prev = n.data as unknown as TemplateStepDraft & {
            isEntry: boolean;
          };
          if (next.id !== prev.id) {
            if (entryStepId === prev.id) setEntryStepId(next.id);
            setEdges((eds) =>
              eds.map((e) => ({
                ...e,
                source: e.source === prev.id ? next.id : e.source,
                target: e.target === prev.id ? next.id : e.target,
              })),
            );
            setSelectedNodeId(next.id);
            return {
              ...n,
              id: next.id,
              data: { ...next, isEntry: prev.isEntry },
            };
          }
          return { ...n, data: { ...next, isEntry: prev.isEntry } };
        }),
      );
    },
    [entryStepId, selectedNodeId],
  );

  const deleteSelectedStep = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      ),
    );
    if (entryStepId === selectedNodeId) setEntryStepId(null);
    setSelectedNodeId(null);
  }, [entryStepId, selectedNodeId]);

  const setSelectedAsEntry = useCallback(() => {
    if (!selectedNodeId) return;
    const next = entryStepId === selectedNodeId ? null : selectedNodeId;
    setEntryStepId(next);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...(n.data as object), isEntry: n.id === next },
      })),
    );
  }, [entryStepId, selectedNodeId]);

  const toggleSelectedEdgeLoop = useCallback(() => {
    if (!selectedEdgeId) return;
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id !== selectedEdgeId) return e;
        const next = !((e.data as EdgeData | undefined)?.isLoop ?? false);
        return { ...e, data: { isLoop: next }, ...edgeStyle(next) };
      }),
    );
  }, [selectedEdgeId]);

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  }, [selectedEdgeId]);

  const addVariable = useCallback((variable: TemplateVariableDraft) => {
    setVariables((vs) => [...vs, variable]);
  }, []);

  // Renaming propagates into every step that references the variable in its
  // `writesTo` / `readsFrom`. Kind / description edits are local to the
  // declaration; only the name change cascades.
  const updateVariable = useCallback(
    (previousName: string, next: TemplateVariableDraft) => {
      setVariables((vs) => vs.map((v) => (v.name === previousName ? next : v)));
      if (next.name === previousName) return;
      setNodes((nds) =>
        nds.map((n) => {
          const data = n.data as unknown as TemplateStepDraft & {
            isEntry: boolean;
          };
          let writesTo = data.writesTo;
          let readsFrom = data.readsFrom;
          let mutated = false;
          if (writesTo) {
            const remapped: Record<string, string> = {};
            for (const [port, varName] of Object.entries(writesTo)) {
              if (varName === previousName) {
                remapped[port] = next.name;
                mutated = true;
              } else {
                remapped[port] = varName;
              }
            }
            writesTo = remapped;
          }
          if (readsFrom) {
            const remapped: Record<string, string> = {};
            for (const [port, varName] of Object.entries(readsFrom)) {
              if (varName === previousName) {
                remapped[port] = next.name;
                mutated = true;
              } else {
                remapped[port] = varName;
              }
            }
            readsFrom = remapped;
          }
          if (!mutated) return n;
          return { ...n, data: { ...data, writesTo, readsFrom } };
        }),
      );
    },
    [],
  );

  const deleteVariable = useCallback((name: string) => {
    setVariables((vs) => vs.filter((v) => v.name !== name));
    // Strip references to the deleted variable from all steps to keep the
    // template consistent.
    setNodes((nds) =>
      nds.map((n) => {
        const data = n.data as unknown as TemplateStepDraft & {
          isEntry: boolean;
        };
        let writesTo = data.writesTo;
        let readsFrom = data.readsFrom;
        let mutated = false;
        if (writesTo) {
          const filtered: Record<string, string> = {};
          for (const [port, varName] of Object.entries(writesTo)) {
            if (varName === name) {
              mutated = true;
              continue;
            }
            filtered[port] = varName;
          }
          writesTo = Object.keys(filtered).length > 0 ? filtered : undefined;
        }
        if (readsFrom) {
          const filtered: Record<string, string> = {};
          for (const [port, varName] of Object.entries(readsFrom)) {
            if (varName === name) {
              mutated = true;
              continue;
            }
            filtered[port] = varName;
          }
          readsFrom = Object.keys(filtered).length > 0 ? filtered : undefined;
        }
        if (!mutated) return n;
        return { ...n, data: { ...data, writesTo, readsFrom } };
      }),
    );
  }, []);

  const isSelectedEntry =
    entryStepId === selectedNodeId && selectedNodeId !== null;

  const steps = useMemo<ReadonlyArray<TemplateStepDraft>>(
    () =>
      nodes
        .filter((n) => n.type === "step")
        .map((n) => {
          const { isEntry: _isEntry, ...rest } =
            n.data as unknown as TemplateStepDraft & {
              isEntry: boolean;
            };
          return rest;
        }),
    [nodes],
  );

  const handle = useMemo<TemplateCanvasHandle>(() => {
    if (isViewRun) {
      const noop = () => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[wf:templates] mutation ignored in view-run mode");
        }
      };
      return {
        uri,
        mutationEnabled: false,
        selectedStep,
        selectedEdge: selectedEdgeInfo,
        isSelectedEntry,
        steps,
        variables,
        name,
        templateId,
        version,
        description,
        setName: noop,
        setTemplateId: noop,
        setVersion: noop,
        setDescription: noop,
        addStep: noop,
        updateSelectedStep: noop,
        deleteSelectedStep: noop,
        setSelectedAsEntry: noop,
        toggleSelectedEdgeLoop: noop,
        deleteSelectedEdge: noop,
        addVariable: noop,
        updateVariable: noop,
        deleteVariable: noop,
        onRequestCreateSkill: noop,
      };
    }
    return {
      uri,
      mutationEnabled: true,
      selectedStep,
      selectedEdge: selectedEdgeInfo,
      isSelectedEntry,
      steps,
      variables,
      name,
      templateId,
      version,
      description,
      setName: persistName,
      setTemplateId,
      setVersion,
      setDescription,
      addStep,
      updateSelectedStep,
      deleteSelectedStep,
      setSelectedAsEntry,
      toggleSelectedEdgeLoop,
      deleteSelectedEdge,
      addVariable,
      updateVariable,
      deleteVariable,
      onRequestCreateSkill: handleRequestCreateSkill,
    };
  }, [
    isViewRun,
    uri,
    selectedStep,
    selectedEdgeInfo,
    isSelectedEntry,
    steps,
    variables,
    name,
    templateId,
    version,
    description,
    persistName,
    addStep,
    updateSelectedStep,
    deleteSelectedStep,
    setSelectedAsEntry,
    toggleSelectedEdgeLoop,
    deleteSelectedEdge,
    addVariable,
    updateVariable,
    deleteVariable,
    handleRequestCreateSkill,
  ]);
  useRegisterTemplateCanvas(uri, handle);

  const buildDraft = (overrides?: {
    name?: string;
    id?: string;
    version?: string;
  }): TemplateDraft => {
    const steps: TemplateStepDraft[] = nodes
      .filter((n) => n.type === "step")
      .map((n) => {
        const { isEntry: _isEntry, ...rest } =
          n.data as unknown as TemplateStepDraft & {
            isEntry: boolean;
          };
        return rest;
      });
    const kindById = new Map(steps.map((s) => [s.id, s.kind]));
    const transitions = edges.map((e) => {
      const data = e.data as (EdgeData & { order?: number }) | undefined;
      const isLoop = data?.isLoop ?? false;
      // A pinned `fromPort` on a loop edge marks an *auto-loop* (orchestrator
      // re-invokes automatically), which the save-time whitelist restricts to
      // `llm.judge` / `format.validate`. Any other source looping back is a
      // *human-feedback* loop — it must NOT carry a `fromPort`, else it both
      // trips the whitelist and makes the orchestrator auto-loop forever after
      // "Valider". See `validateAutoLoopWhitelist`.
      const isAutoLoopSource =
        isLoop && AUTO_LOOP_SOURCE_KINDS.has(kindById.get(e.source) ?? "");
      const fromPort =
        isLoop && !isAutoLoopSource ? undefined : e.sourceHandle ?? undefined;
      return {
        from: e.source,
        fromPort,
        to: e.target,
        toPort: e.targetHandle ?? undefined,
        isLoop,
        ...(typeof data?.order === "number" ? { order: data.order } : {}),
      };
    });
    const outgoing = new Set(
      transitions.filter((t) => !t.isLoop).map((t) => t.from),
    );
    const exitSteps = steps.map((s) => s.id).filter((id) => !outgoing.has(id));
    return {
      id: (overrides?.id ?? templateId).trim(),
      version: (overrides?.version ?? version).trim(),
      name: (overrides?.name ?? name).trim(),
      description: description.trim(),
      entryStep: entryStepId ?? "",
      exitSteps,
      steps,
      transitions,
      variables,
      status: "draft",
    };
  };

  const validateDraft = (draft: TemplateDraft): string | null => {
    if (!draft.id) return "L'ID du template est requis.";
    if (!draft.version) return "La version est requise.";
    if (!draft.name) return "Le nom est requis.";
    if (draft.steps.length === 0) return "Ajoute au moins une étape.";
    if (!draft.entryStep) return "Choisis une étape d'entrée.";
    const ids = new Set<string>();
    for (const s of draft.steps) {
      if (!s.id) return `Une étape n'a pas d'ID.`;
      if (ids.has(s.id)) return `ID d'étape dupliqué : ${s.id}`;
      ids.add(s.id);
    }
    if (!ids.has(draft.entryStep)) {
      return `L'étape d'entrée "${draft.entryStep}" est inconnue.`;
    }
    if (byKind) {
      const stepById = new Map(draft.steps.map((s) => [s.id, s]));
      // Track edges-per-(target, port) for cardinality on non-isList ports.
      const cardinality = new Map<string, number>();
      for (const t of draft.transitions) {
        if (t.isLoop) continue;
        const src = stepById.get(t.from);
        const dst = stepById.get(t.to);
        if (!src || !dst) return `Transition orpheline : ${t.from} → ${t.to}`;
        const srcSpec = resolveStepSpec(src, byKind, variables, subTemplates);
        const dstSpec = resolveStepSpec(dst, byKind, variables, subTemplates);
        if (!srcSpec || !dstSpec) continue;
        if (
          !transitionTypable(srcSpec, dstSpec, {
            fromPort: t.fromPort,
            toPort: t.toPort,
            resolver: refinementResolver,
          })
        ) {
          const srcOut =
            (t.fromPort
              ? srcSpec.outputs.find((o) => o.name === t.fromPort)?.kind
              : srcSpec.outputs[0]?.kind) ?? "—";
          const dstAccepted = dstSpec.inputs
            .map((p) => p.kinds.join("|"))
            .join(" / ");
          return `Incompatibilité d'artefact : ${src.id} produit ${srcOut}, mais ${dst.id} n'accepte que [${dstAccepted || "∅"}].`;
        }
        const portName = t.toPort ?? dstSpec.inputs[0]?.name;
        if (!portName) continue;
        const port = dstSpec.inputs.find((p) => p.name === portName);
        if (!port) continue;
        if (dstSpec.inputs.length > 1 && !t.toPort) {
          return `Transition ${t.from} → ${t.to} : préciser un port cible (le node a ${dstSpec.inputs.length} entrées).`;
        }
        if (port.isList && !t.toPort) {
          return `Transition ${t.from} → ${t.to} : le port "${port.name}" est isList — préciser un toPort explicite.`;
        }
        const key = `${t.to}|${portName}`;
        const next = (cardinality.get(key) ?? 0) + 1;
        cardinality.set(key, next);
        if (!port.isList && next > 1) {
          return `Le port "${portName}" de ${t.to} n'est pas isList : il ne peut pas recevoir ${next} transitions entrantes.`;
        }
      }
    }
    return null;
  };

  const buildLayoutSnapshot = useCallback((): TemplateLayout => {
    const positions: Record<string, NodePositionEntry> = {};
    const groups: GroupLayout[] = [];
    for (const n of nodes) {
      if (isSyntheticId(n.id)) continue;
      if (n.type === "group") {
        const data = (n.data ?? {}) as { label?: string };
        const w = n.width ?? (n.style?.width as number | undefined) ?? 0;
        const h = n.height ?? (n.style?.height as number | undefined) ?? 0;
        groups.push({
          id: n.id,
          position: { x: n.position.x, y: n.position.y },
          size: { width: w, height: h },
          label: data.label ?? "",
        });
        continue;
      }
      positions[n.id] = {
        x: n.position.x,
        y: n.position.y,
        ...(n.parentId ? { parentId: n.parentId } : {}),
      };
    }
    return {
      positions,
      ...(groups.length > 0 ? { groups } : {}),
      viewport: rf.getViewport(),
      updatedAt: new Date().toISOString(),
    };
  }, [nodes, rf]);

  const missingRequiredFields = (
    draft: TemplateDraft,
  ): ReadonlyArray<MissingRequiredField> => {
    const out: MissingRequiredField[] = [];
    if (!draft.name) out.push("name");
    if (!draft.id) out.push("id");
    if (!draft.version) out.push("version");
    return out;
  };

  const performSave = async (draft: TemplateDraft) => {
    setBusy(true);
    try {
      await services.saveWorkflowTemplate(draft);
      // Pour un template fraîchement créé (ou dupliqué depuis un `fromRef`),
      // l'auto-save layout est inactif tant qu'il n'y a pas de ligne cible.
      // On capture donc l'état courant ici, juste après que la ligne vient
      // d'être créée. Échec non-bloquant pour la navigation.
      if (isNew) {
        try {
          await services.saveTemplateLayout(
            `${draft.id}@${draft.version}`,
            buildLayoutSnapshot(),
          );
        } catch (e) {
          console.warn("[wf:templates] first layout save failed", e);
        }
      }
      toast.success(t("template.editor.toast.saved"), {
        description: `${draft.name} · ${draft.id}@${draft.version}`,
      });
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      // Pour un template fraîchement créé, on bascule l'onglet sur l'URI
      // canonique du template (`template://<id>@<version>`) — sans ça,
      // `editingRef` resterait null et l'auto-save layout + le lancement
      // de run resteraient désactivés.
      if (isNew) {
        const savedUri = templateUriFor(`${draft.id}@${draft.version}`);
        if (savedUri !== uri) {
          api.openEditor(savedUri, { focus: true });
          api.closeEditor(uri);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    const draft = buildDraft();
    const missing = missingRequiredFields(draft);
    if (missing.length > 0) {
      setMissingFieldsModal({ fields: missing });
      return;
    }
    const local = validateDraft(draft);
    if (local) {
      setError(local);
      return;
    }
    await performSave(draft);
  };

  const handleMissingFieldsConfirm = async (values: {
    name: string;
    id: string;
    version: string;
  }) => {
    // Les setters écrasent ce qui pouvait être saisi dans le panel *Template* :
    // c'est voulu — la modal est l'autorité sur ces 3 champs au moment du Save.
    setName(values.name);
    setTemplateId(values.id);
    setVersion(values.version);
    setMissingFieldsModal(null);
    setError(null);

    // On rebuilt un draft avec les valeurs fraîches plutôt que d'attendre le
    // re-render : sinon il faudrait un useEffect pour relancer la sauvegarde,
    // ce qui complique le séquencement et masque l'origine du save.
    const draft = buildDraft(values);
    const local = validateDraft(draft);
    if (local) {
      setError(local);
      return;
    }
    await performSave(draft);
  };

  const handleExportSvg = useCallback(async () => {
    try {
      const svg = renderWorkflowSvg(rf, rf.getNodes(), rf.getEdges(), {
        byKind,
        variables,
      });
      // eslint-disable-next-line no-restricted-syntax -- TODO(dette technique) : exposer `system.saveTextFile` via un port FileSystem injecté par useServices() pour rétablir l'isolation hexagonale (cf. ARCHITECTURE.md §9.4-9.5).
      const written = await window.api.system.saveTextFile({
        content: svg,
        defaultFileName: buildSvgFileName(name),
        title: "Exporter le workflow en SVG",
        filters: [{ name: "SVG", extensions: ["svg"] }],
      });
      if (written) {
        toast.success(t("template.editor.toast.exportedSvg"), {
          description: written,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t("template.editor.toast.exportSvgFailed"), {
        description: message,
      });
    }
  }, [name, rf, byKind, variables, t]);

  const handleExportPng = useCallback(async () => {
    try {
      const png = await renderWorkflowPng(rf, rf.getNodes(), rf.getEdges(), {
        byKind,
        variables,
      });
      // eslint-disable-next-line no-restricted-syntax -- TODO(dette technique) : exposer `system.saveBinaryFile` via un port FileSystem injecté par useServices() pour rétablir l'isolation hexagonale (cf. ARCHITECTURE.md §9.4-9.5).
      const written = await window.api.system.saveBinaryFile({
        content: png,
        defaultFileName: buildPngFileName(name),
        title: "Exporter le workflow en PNG",
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (written) {
        toast.success(t("template.editor.toast.exportedPng"), {
          description: written,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t("template.editor.toast.exportPngFailed"), {
        description: message,
      });
    }
  }, [name, rf, byKind, variables, t]);

  const handleExportJson = useCallback(async () => {
    if (!editingRef) return;
    try {
      const { path } = await services.exportWorkflowTemplate(editingRef);
      if (path) {
        toast.success(t("template.editor.toast.exportedJson"), {
          description: path,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t("template.editor.toast.exportJsonFailed"), {
        description: message,
      });
    }
  }, [editingRef, services, t]);

  if (loading || specs.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (specs.status === "error") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {t("template.editor.specsError")} {specs.error}
      </div>
    );
  }

  const editorContent = (
    <div className="flex h-full min-w-0 flex-col" data-template-editor>
      <TemplateTitleBar />
      {isViewRun ? null : (
        <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-b from-muted/60 to-transparent px-3 py-1.5">
          <div className="flex items-center gap-0.5">
            <ToolbarButton
              icon={launch ? X : Play}
              variant={launch ? "outline" : "default"}
              label={
                !canLaunch
                  ? editingRef === null
                    ? "Sauvegarder le template avant de pouvoir le lancer"
                    : hasMissingDeps
                      ? "Dépendances manquantes — résous-les avant de lancer un run"
                      : "Définir une étape d'entrée avant de pouvoir lancer"
                  : launch
                    ? "Annuler le lancement"
                    : "Lancer un run depuis ce template"
              }
              onClick={launch ? handleLaunchClose : handleLaunchOpen}
              disabled={!canLaunch}
            />
          </div>
          <div className="flex items-center gap-0.5 border-l pl-2">
            <ToolbarButton
              icon={AlignVerticalSpaceAround}
              label={t("template.editor.toolbar.autoLayout.vertical")}
              onClick={() => handleAutoLayout("vertical")}
            />
            <ToolbarButton
              icon={AlignHorizontalSpaceAround}
              label={t("template.editor.toolbar.autoLayout.horizontal")}
              onClick={() => handleAutoLayout("horizontal")}
            />
            <ToolbarButton
              icon={Columns2}
              label={t("template.editor.toolbar.autoLayout.twoColumns")}
              onClick={() => handleAutoLayout("two-columns")}
            />
          </div>
          <div className="ml-2 flex items-center gap-0.5 border-l pl-2">
            <ToolbarButton
              icon={StickyNote}
              label={
                notesVisible
                  ? "Masquer les notes des étapes"
                  : "Afficher les notes des étapes"
              }
              onClick={() => setNotesVisible((v) => !v)}
              className={
                notesVisible ? "bg-accent text-accent-foreground" : undefined
              }
            />
            <ToolbarButton
              icon={Frame}
              label={
                groupDrawingMode
                  ? "Annuler — Échap pour quitter"
                  : "Créer un groupe (drag un rectangle sur le canvas)"
              }
              onClick={() => setGroupDrawingMode((v) => !v)}
              className={
                groupDrawingMode
                  ? "bg-accent text-accent-foreground"
                  : undefined
              }
            />
            <ToolbarButton
              icon={NotebookPen}
              label={t("template.editor.stickyNote.add")}
              onClick={addStickyNote}
            />
            <ToolbarButton
              icon={Grid3x3}
              label={
                gridSnap.enabled
                  ? `Snap activé (pas : ${gridSnap.size} px) — cliquer pour désactiver`
                  : "Activer le snap à la grille"
              }
              onClick={() =>
                setTemplateEditorGridSnap({ enabled: !gridSnap.enabled })
              }
              className={
                gridSnap.enabled ? "bg-accent text-accent-foreground" : undefined
              }
            />
            <ToolbarButton
              icon={isMaximized ? Minimize2 : Maximize2}
              label={
                isMaximized
                  ? "Quitter le plein écran (Échap)"
                  : "Afficher le graph en plein écran"
              }
              onClick={() => setIsMaximized((v) => !v)}
              className={
                isMaximized ? "bg-accent text-accent-foreground" : undefined
              }
            />
            <Menu.Root>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Menu.Trigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t(
                            "template.editor.toolbar.grid.chooseStepAriaLabel",
                          )}
                        >
                          <ChevronDown />
                        </Button>
                      }
                    />
                  }
                />
                <TooltipContent>
                  {t("template.editor.toolbar.grid.stepTooltip")}
                </TooltipContent>
              </Tooltip>
              <Menu.Portal>
                <Menu.Positioner align="end" sideOffset={4} className="z-50">
                  <Menu.Popup
                    render={
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        style={{ transformOrigin: "top right" }}
                      />
                    }
                    className={menuPopupClass}
                  >
                    {[10, 20, 40, 80].map((size) => (
                      <Menu.Item
                        key={size}
                        className={cn(menuItemClass)}
                        onClick={() => setTemplateEditorGridSnap({ size })}
                      >
                        <Check
                          className={cn(
                            "size-4 text-muted-foreground",
                            gridSnap.size === size ? "visible" : "invisible",
                          )}
                        />
                        {size === 20 ? `${size} px (défaut)` : `${size} px`}
                      </Menu.Item>
                    ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
          <div className="ml-2 flex items-center gap-0.5 border-l pl-2">
            <NodesPickerMenu disabled={false} onPick={addStep} />
            <VariablesPickerMenu
              disabled={false}
              variables={variables}
              onPick={(v) =>
                setVariableModal({ open: true, mode: "edit", variable: v })
              }
              onRequestCreate={() =>
                setVariableModal({ open: true, mode: "create" })
              }
            />
            <Menu.Root>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Menu.Trigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t(
                            "template.editor.toolbar.export.trigger",
                          )}
                          disabled={nodes.length === 0 && !editingRef}
                        >
                          <Download />
                        </Button>
                      }
                    />
                  }
                />
                <TooltipContent>
                  {t("template.editor.toolbar.export.trigger")}
                </TooltipContent>
              </Tooltip>
              <Menu.Portal>
                <Menu.Positioner align="end" sideOffset={4} className="z-50">
                  <Menu.Popup
                    render={
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        style={{ transformOrigin: "top right" }}
                      />
                    }
                    className={menuPopupClass}
                  >
                    <Menu.Item
                      className={cn(
                        menuItemClass,
                        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                      )}
                      onClick={handleExportJson}
                      disabled={!editingRef}
                    >
                      <FileJson className="size-4 text-muted-foreground" />
                      {t("template.editor.toolbar.export.json")}
                    </Menu.Item>
                    <Menu.Item
                      className={cn(
                        menuItemClass,
                        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                      )}
                      onClick={handleExportSvg}
                      disabled={nodes.length === 0}
                    >
                      <Download className="size-4 text-muted-foreground" />
                      {t("template.editor.toolbar.export.svg")}
                    </Menu.Item>
                    <Menu.Item
                      className={cn(
                        menuItemClass,
                        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                      )}
                      onClick={handleExportPng}
                      disabled={nodes.length === 0}
                    >
                      <FileImage className="size-4 text-muted-foreground" />
                      {t("template.editor.toolbar.export.png")}
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            {hasMissingDeps ? (
              <ToolbarButton
                icon={AlertTriangle}
                label={`${totalMissingDeps(missingDeps)} dépendance(s) manquante(s) — cliquer pour voir`}
                onClick={() => setMissingDepsModalOpen(true)}
                className="text-destructive hover:text-destructive"
              />
            ) : null}
            <ToolbarButton
              icon={Save}
              label={busy ? "Sauvegarde…" : "Sauvegarder le brouillon"}
              onClick={handleSave}
              disabled={busy}
            />
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <ToolbarButton
              icon={Trash2}
              label={t("template.editor.toolbar.clearAll")}
              onClick={handleClearAll}
              disabled={nodes.length === 0 && edges.length === 0}
            />
          </div>
        </div>
      )}

      <LaunchRunDialog
        open={launch !== null && !isViewRun}
        title={name.trim() ? `Lancer « ${name.trim()} »` : "Lancer un run"}
        needsSeed={launchNeedsSeed}
        seedKind={launchSeedKind}
        text={launch?.text ?? ""}
        busy={launch?.busy ?? false}
        error={launch?.error ?? null}
        onTextChange={(text) =>
          setLaunch((prev) => (prev ? { ...prev, text } : prev))
        }
        onSubmit={() => void handleLaunchSubmit()}
        onClose={handleLaunchClose}
      />

      {error ? (
        <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div
        ref={flowWrapperRef}
        className="relative flex min-h-0 min-w-0 flex-1"
      >
        <NotesVisibilityProvider value={notesVisible}>
          <GroupActionsProvider value={groupActions}>
            <StickyNoteActionsProvider value={stickyActions}>
            <ReactFlow
              // Don't mount/rasterize off-screen nodes. Visually identical, but
              // keeps Chromium's GPU tile budget from blowing up when zoomed out
              // (every visible backdrop-blur node is a separate compositor layer
              // re-rasterized on each pan frame → "tile memory limits exceeded").
              onlyRenderVisibleElements
              nodes={displayNodes}
              edges={displayEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={isViewRun ? undefined : onNodesChange}
              onEdgesChange={isViewRun ? undefined : onEdgesChange}
              onConnect={isViewRun ? undefined : onConnect}
              onConnectStart={isViewRun ? undefined : onConnectStart}
              onConnectEnd={isViewRun ? undefined : onConnectEnd}
              isValidConnection={isViewRun ? undefined : isValidConnection}
              nodesDraggable={!isViewRun}
              nodesConnectable={!isViewRun}
              deleteKeyCode={isViewRun ? null : "Delete"}
              onNodeClick={(_, n) => {
                if (isSyntheticId(n.id)) return;
                // Les groupes et les notes ne pilotent pas l'inspecteur.
                if (n.type === "group" || n.type === "stickyNote") {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                  return;
                }
                if (runOverlay) {
                  runOverlay.onSelectStep(n.id);
                  return;
                }
                // Pas de fit-view ici : l'animation déplaçait la node sous le
                // curseur pendant 300 ms, et un second clic réflexe atterrissait
                // dans le vide (→ onPaneClick → désélection), donnant l'illusion
                // qu'il fallait cliquer plusieurs fois pour ouvrir l'inspecteur.
                setSelectedNodeId(n.id);
                setSelectedEdgeId(null);
              }}
              onNodeDoubleClick={(_, n) => {
                // A `workflow.call` (sub-template-expand.md §11b) or a
                // `template.invoke` (sub-template-invoke.md §9c) node opens its
                // referenced sub-template in a new editor tab. The sub-graph is
                // never inlined in the parent editor — it is edited on its own.
                const kind = n.data?.["kind"];
                if (kind !== "workflow.call" && kind !== "template.invoke") return;
                const cfg = (n.data?.["config"] ?? {}) as Record<string, unknown>;
                const id = typeof cfg["templateId"] === "string" ? cfg["templateId"] : "";
                const version =
                  typeof cfg["templateVersion"] === "string" ? cfg["templateVersion"] : "";
                if (!id || !version) return;
                api.openEditor(templateUriFor(`${id}@${version}`), { focus: true });
              }}
              onEdgeClick={(_, e) => {
                if (isViewRun) return;
                if (isSyntheticId(e.id)) return;
                setSelectedEdgeId(e.id);
                setSelectedNodeId(null);
              }}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
              onNodeDragStop={isViewRun ? undefined : handleNodeDragStop}
              onMoveEnd={isViewRun ? undefined : layoutAutosave.onMoveEnd}
              snapToGrid={gridSnap.enabled}
              snapGrid={[gridSnap.size, gridSnap.size]}
              onDragOver={
                isViewRun
                  ? undefined
                  : (event) => {
                      if (!event.dataTransfer.types.includes(STEP_KIND_DND_MIME))
                        return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                    }
              }
              onDrop={
                isViewRun
                  ? undefined
                  : (event) => {
                      const kindId = event.dataTransfer.getData(
                        STEP_KIND_DND_MIME,
                      );
                      if (!kindId) return;
                      const kind = getKindMeta(kindId);
                      if (!kind) return;
                      event.preventDefault();
                      const flowPos = screenToFlowPosition(
                        { x: event.clientX, y: event.clientY },
                        gridSnap.enabled
                          ? {
                              snapToGrid: true,
                              snapGrid: [gridSnap.size, gridSnap.size],
                            }
                          : undefined,
                      );
                      addStep(kind, {
                        x: flowPos.x - AUTO_LAYOUT_DEFAULT_WIDTH / 2,
                        y: flowPos.y - AUTO_LAYOUT_DEFAULT_HEIGHT / 2,
                      });
                    }
              }
              fitView={!initialLayout?.viewport}
              defaultViewport={initialLayout?.viewport}
              minZoom={0.2}
              maxZoom={4}
            >
              {/* ComfyUI-style dual grid: lines slightly darker than the
              background so the grid stays discreet. The major grid every
              5 cells is barely a notch stronger than the minor one. */}
              <Background
                id="grid-minor"
                variant={BackgroundVariant.Lines}
                gap={20}
                lineWidth={1}
                color="color-mix(in srgb, black 10%, transparent)"
              />
              <Background
                id="grid-major"
                variant={BackgroundVariant.Lines}
                gap={100}
                lineWidth={1}
                color="color-mix(in srgb, black 20%, transparent)"
              />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                ariaLabel="Mini carte du graph"
                nodeColor={minimapNodeColor}
                nodeStrokeColor={minimapNodeStrokeColor}
                nodeStrokeWidth={1.5}
                nodeBorderRadius={8}
                bgColor="color-mix(in srgb, var(--background) 92%, transparent)"
                maskColor="color-mix(in srgb, var(--background) 58%, transparent)"
                maskStrokeColor="var(--ring)"
                maskStrokeWidth={1}
                className="overflow-hidden rounded-md border border-border shadow-sm opacity-90 transition-opacity hover:opacity-100"
                style={{ width: 164, height: 108 }}
              />
              <Controls />
            </ReactFlow>
            </StickyNoteActionsProvider>
          </GroupActionsProvider>
        </NotesVisibilityProvider>
        {groupDrawingMode ? (
          <div
            className="absolute inset-0 z-10 cursor-crosshair"
            onPointerDown={onOverlayPointerDown}
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
            onPointerCancel={onOverlayPointerUp}
          />
        ) : null}
        {layoutSaveError ? (
          <div
            className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm"
            title={layoutSaveError}
          >
            {t("template.editor.layoutSaveError")}
          </div>
        ) : null}
        {pendingConnect ? (
          <EdgeDropSuggestions
            position={pendingConnect.popupPos}
            suggestions={suggestions}
            onSelect={handleSuggestionPick}
            onClose={() => setPendingConnect(null)}
          />
        ) : null}
        {!isViewRun && (selectedNodeId !== null || selectedEdgeId !== null) ? (
          <div
            className={cn(
              "absolute right-2 top-2 bottom-2 z-20",
              "flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-150",
            )}
            style={{ width: inspectorWidth }}
            data-template-editor
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t("template.editor.inspector.resizeAriaLabel")}
              className={cn(
                "absolute left-0 top-0 bottom-0 z-10 w-1.5 cursor-ew-resize",
                "transition-colors hover:bg-primary/30",
                inspectorDragWidth !== null && "bg-primary/40",
              )}
              onPointerDown={onInspectorResizeStart}
              onPointerMove={onInspectorResizeMove}
              onPointerUp={onInspectorResizeEnd}
              onPointerCancel={onInspectorResizeEnd}
            />
            <TemplateInspectorView />
          </div>
        ) : null}
      </div>
      <TemplateMissingDepsModal
        open={missingDepsModalOpen}
        onOpenChange={setMissingDepsModalOpen}
        missing={missingDeps}
      />
      <TemplateSaveMissingModal
        open={missingFieldsModal !== null}
        missing={missingFieldsModal?.fields ?? []}
        initial={{ name, id: templateId, version }}
        busy={busy}
        onConfirm={(values) => void handleMissingFieldsConfirm(values)}
        onCancel={() => setMissingFieldsModal(null)}
      />
      <VariableEditorModal
        open={variableModal.open}
        mode={
          variableModal.open && variableModal.mode === "edit"
            ? { kind: "edit", variable: variableModal.variable }
            : { kind: "create" }
        }
        variables={variables}
        steps={steps}
        onSubmit={(next, previousName) => {
          if (previousName === null) addVariable(next);
          else updateVariable(previousName, next);
          setVariableModal({ open: false });
        }}
        onDelete={
          variableModal.open && variableModal.mode === "edit"
            ? () => {
                deleteVariable(variableModal.variable.name);
                setVariableModal({ open: false });
              }
            : undefined
        }
        onOpenChange={(o) => {
          if (!o) setVariableModal({ open: false });
        }}
      />
    </div>
  );

  if (isMaximized) {
    return createPortal(
      <div className="fixed inset-x-0 bottom-0 top-8 z-40 bg-background">
        {editorContent}
      </div>,
      document.body,
    );
  }

  return editorContent;
};

const TemplateEditor = (props: Props) => (
  <ReactFlowProvider>
    <TemplateEditorInner {...props} />
  </ReactFlowProvider>
);

export default TemplateEditor;
