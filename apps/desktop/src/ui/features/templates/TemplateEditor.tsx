import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeMouseHandler,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { transitionTypable } from "@shared/wf/port-accepts";
import type { TemplateLayout } from "@shared/wf/layout";
import { useT } from "../../i18n";
import { useServices } from "../../di/services-provider";
import {
  type TemplateStepDraft,
  type TemplateVariableDraft,
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
  getKindMeta,
  type StepKindMeta,
} from "../../components/templates/step-kinds";
import { STEP_KIND_DND_MIME } from "./picker-dnd";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import type { EditorUri, WorkbenchApi } from "../../workbench/types";
import { useTemplateEditorGridSnap } from "../../workbench/store";
import {
  fromRefFromTemplateUri,
  refFromTemplateUri,
  templateUriFor,
} from "./template-uri";
import {
  useRegisterTemplateCanvas,
  type TemplateCanvasHandle,
} from "../../stores/template-canvas-store";
import TemplateTitleBar from "./TemplateTitleBar";
import LaunchRunDialog from "./LaunchRunDialog";
import { useLayoutAutosave } from "./useLayoutAutosave";
import { useInspectorResize } from "./template-editor/hooks/useInspectorResize";
import { useMaximize } from "./template-editor/hooks/useMaximize";
import { useSkillHandoff } from "./template-editor/hooks/useSkillHandoff";
import { useTemplateDeps } from "./template-editor/hooks/useTemplateDeps";
import { useNodeReparenting } from "./template-editor/hooks/useNodeReparenting";
import { useAutoLayout } from "./template-editor/hooks/useAutoLayout";
import { useStickyNotes } from "./template-editor/hooks/useStickyNotes";
import { useGroupTools } from "./template-editor/hooks/useGroupTools";
import { useStepMutations } from "./template-editor/hooks/useStepMutations";
import { useTemplateVariables } from "./template-editor/hooks/useTemplateVariables";
import { useEdgeDropSuggestions } from "./template-editor/hooks/useEdgeDropSuggestions";
import { useLaunchRun } from "./template-editor/hooks/useLaunchRun";
import { useTemplateSave } from "./template-editor/hooks/useTemplateSave";
import { useWorkflowExport } from "./template-editor/hooks/useWorkflowExport";
import TemplateEditorToolbar from "./template-editor/components/TemplateEditorToolbar";
import TemplateEditorModals from "./template-editor/components/TemplateEditorModals";
import TemplateCanvasOverlays from "./template-editor/components/TemplateCanvasOverlays";
import type { VariableModalState } from "./template-editor/components/variable-modal";
import type { RunOverlay } from "./run-overlay";
import {
  START_EDGE_ID,
  START_NODE_ID,
  VARIABLE_EDGE_PREFIX,
  VARIABLE_NODE_PREFIX,
  highestCounterForKind,
  isSyntheticId,
  makeStepId,
} from "./template-editor/graph/ids";
import { absPosOf } from "./template-editor/graph/geometry";
import {
  AUTO_LAYOUT_DEFAULT_HEIGHT,
  AUTO_LAYOUT_DEFAULT_WIDTH,
} from "./template-editor/graph/auto-layout";
import { templateToGraph } from "./template-editor/graph/template-to-graph";
import {
  buildDefaultStep,
  resolveStepSpec,
  type ByKind,
} from "./template-editor/graph/step-spec";
import {
  minimapNodeColor,
  minimapNodeStrokeColor,
  type EdgeData,
} from "./template-editor/graph/edge-style";

const nodeTypes = {
  step: StepNode,
  start: StartNode,
  variable: VariableNode,
  group: GroupNode,
  stickyNote: StickyNoteNode,
} as const;
const edgeTypes = { selfLoop: SelfLoopEdge, step: StepEdge } as const;

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
  // Live mirrors of the node/edge state, read by handlers that need the current
  // graph at call time without capturing the arrays in their closure — keeping
  // those callbacks (e.g. `isValidConnection`) referentially stable across the
  // re-renders a drag triggers (guide §2).
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const [entryStepId, setEntryStepId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // État des variables + mutations avec cascade dans les nodes (un renommage
  // se propage dans les `writesTo`/`readsFrom` ; une suppression purge les
  // références). `setVariables` brut sert au chargement initial du template.
  const { variables, setVariables, addVariable, updateVariable, deleteVariable } =
    useTemplateVariables({ setNodes });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Statut persisté du template chargé (`draft` tant qu'on écrit, `published`
  // une fois figé). Sert à savoir si la publication est encore possible : une
  // ref publiée est immuable, on itère en bumpant la version (ce qui repasse le
  // statut à `draft`, cf. `handleTemplateIdChange` / `handleVersionChange`).
  const [status, setStatus] = useState<"draft" | "published">("draft");

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
  // Éditer l'ID ou la version cible vise une *nouvelle* ref qui n'est pas encore
  // publiée : on rebascule le statut local sur `draft` pour rouvrir la
  // publication (une ref publiée reste immuable, on itère donc en bumpant la
  // version). Le chargement initial utilise les setters bruts + un `setStatus`
  // explicite, il n'est pas affecté.
  const handleTemplateIdChange = useCallback((next: string) => {
    setTemplateId(next);
    setStatus("draft");
  }, []);
  const handleVersionChange = useCallback((next: string) => {
    setVersion(next);
    setStatus("draft");
  }, []);
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

  const [notesVisible, setNotesVisible] = useState<boolean>(false);
  // Full-app maximize: when true, the editor portals itself just under the
  // window title bar to cover the activity bar + dock. Escape exits.
  const { isMaximized, setIsMaximized } = useMaximize();

  // Grid snap (spec template-editor-grid-snap) — réglage global utilisateur
  // persisté dans WorkbenchPrefs, pas attaché au template.
  const gridSnap = useTemplateEditorGridSnap();

  // Largeur de l'overlay Inspector (px) + handlers de la poignée de resize.
  const {
    inspectorWidth,
    inspectorDragWidth,
    onInspectorResizeStart,
    onInspectorResizeMove,
    onInspectorResizeEnd,
  } = useInspectorResize();

  // Handoff state: when the user requests inline skill creation from the
  // StepInspector, we remember which step is waiting so that when the new
  // skill is saved we can auto-assign it and refocus this editor tab.
  const { handleRequestCreateSkill } = useSkillHandoff({
    api,
    uri,
    setNodes,
  });

  // Available skill refs / artifact kinds — used to detect missing deps on
  // imported templates. Derived from the react-query caches so an external
  // mutation (skill saved, artifact type created, …) propagates without
  // re-mounting this editor.
  const {
    subTemplates,
    refinementResolver,
    missingDeps,
    hasMissingDeps,
    missingDepsModalOpen,
    setMissingDepsModalOpen,
  } = useTemplateDeps({
    nodes,
    templateId,
    version,
    name,
    description,
    entryStepId,
    variables,
    editingRef,
    loading,
  });

  const [variableModal, setVariableModal] = useState<VariableModalState>({
    open: false,
  });

  const counterRef = useRef(0);
  const flowWrapperRef = useRef<HTMLDivElement>(null);
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
          setStatus(tpl.status);
        } else {
          // Une copie repart toujours d'un brouillon : nouvelle ref à publier.
          setName(`${tpl.name} (copie)`);
          setTemplateId(`${tpl.id}-copy`);
          setVersion(tpl.version);
          setStatus("draft");
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
    // `setVariables` provient désormais de `useTemplateVariables` (prop stable) :
    // listé pour exhaustive-deps, les autres setters bruts restent reconnus.
  }, [editingRef, fromRef, services, setVariables]);

  const byKind: ByKind | null = specs.status === "ready" ? specs.byKind : null;

  // Dérivés de sélection + mutateurs de domaine sur l'élément sélectionné
  // (édition/suppression de step, (dé)marquage entrée, toggle/suppression
  // d'edge). La sélection elle-même (`selectedNodeId` / `selectedEdgeId`) reste
  // possédée ici : de nombreux autres handlers la fixent.
  const {
    selectedStep,
    selectedEdgeInfo,
    updateSelectedStep,
    deleteSelectedStep,
    setSelectedAsEntry,
    toggleSelectedEdgeLoop,
    deleteSelectedEdge,
  } = useStepMutations({
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    entryStepId,
    setNodes,
    setEdges,
    setEntryStepId,
    setSelectedNodeId,
    setSelectedEdgeId,
  });

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

  // Auto-layout group-aware (deux passes : layout intra-groupe puis layout des
  // supernodes au niveau global) — détaillé dans le hook. Les groupes survivent
  // à l'opération, leurs membres restent dedans et le groupe se redimensionne.
  const { handleAutoLayout } = useAutoLayout({
    nodes,
    edges,
    entryStepId,
    setNodes,
    layoutAutosave,
    rf,
  });

  // Outils de groupe : actions (renommage/suppression) + outil de dessin au
  // rectangle (état `groupDrawingMode` + handlers pointeur de l'overlay +
  // Escape pour annuler un tracé).
  const {
    groupActions,
    groupDrawingMode,
    setGroupDrawingMode,
    onOverlayPointerDown,
    onOverlayPointerMove,
    onOverlayPointerUp,
  } = useGroupTools({ setNodes, screenToFlowPosition, layoutAutosave });

  // ── Notes post-it (données purement présentationnelles, persistées dans le
  // layout via l'autosave debounced — cf. spec template-sticky-notes). ──
  const { addStickyNote, stickyActions } = useStickyNotes({
    nodes,
    setNodes,
    screenToFlowPosition,
    flowWrapperRef,
    layoutAutosave,
    isViewRun,
  });

  // Au drop d'un step : ré-évalue son parent selon le containment positionnel
  // de son centre absolu, traduit ses coords si reparenting, et auto-grow
  // les groupes affectés pour qu'ils enclosent leurs enfants avec padding.
  // Pour un drop de groupe, React Flow a déjà déplacé les enfants (parentId)
  // — il suffit de programmer la sauvegarde.
  const { handleNodeDragStop } = useNodeReparenting({ setNodes, layoutAutosave });

  // Lancement d'un run depuis le template : dérivés d'entry step + dialogue
  // (open/close/submit). `canLaunch` exige un template persisté, une entrée et
  // aucune dépendance manquante.
  const {
    launch,
    launchNeedsSeed,
    launchSeedKind,
    canLaunch,
    setLaunch,
    handleLaunchOpen,
    handleLaunchClose,
    handleLaunchSubmit,
  } = useLaunchRun({
    nodes,
    entryStepId,
    byKind,
    variables,
    subTemplates,
    editingRef,
    hasMissingDeps,
    services,
    api,
  });

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
      const currentNodes = nodesRef.current;
      const src = currentNodes.find((n) => n.id === conn.source);
      const tgt = currentNodes.find((n) => n.id === conn.target);
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
        const existing = edgesRef.current.some(
          (e) =>
            e.target === conn.target &&
            (e.targetHandle ?? null) === (conn.targetHandle ?? null) &&
            !(e.data as EdgeData | undefined)?.isLoop,
        );
        if (existing) return false;
      }
      return true;
    },
    [byKind, variables, subTemplates],
  );

  // Connexion d'edges + menu de suggestions au drop sur le vide. `counterRef`
  // est partagé avec `addStep` (séquence d'IDs de step) → fourni en option.
  const {
    pendingConnect,
    setPendingConnect,
    suggestions,
    handleSuggestionPick,
    onConnect,
    onConnectStart,
    onConnectEnd,
  } = useEdgeDropSuggestions({
    nodes,
    byKind,
    variables,
    subTemplates,
    refinementResolver,
    screenToFlowPosition,
    flowWrapperRef,
    counterRef,
    setNodes,
    setEdges,
    setEntryStepId,
    setSelectedNodeId,
    setSelectedEdgeId,
  });

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

  // Handlers passed to <ReactFlow> are memoized so a re-render of the editor
  // doesn't hand React Flow new prop references on every frame (guide §1/§2).
  // The `isViewRun` guard lives *inside* each callback (early-return) rather
  // than as an outer ternary, so the prop reference stays stable across modes.
  // `useState` setters are guaranteed stable → omitted from deps.
  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, n) => {
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
    },
    [runOverlay],
  );

  const onNodeDoubleClick = useCallback<NodeMouseHandler>(
    (_, n) => {
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
    },
    [api],
  );

  const onEdgeClick = useCallback<EdgeMouseHandler>(
    (_, e) => {
      if (isViewRun) return;
      if (isSyntheticId(e.id)) return;
      setSelectedEdgeId(e.id);
      setSelectedNodeId(null);
    },
    [isViewRun],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const snapGrid = useMemo<[number, number]>(
    () => [gridSnap.size, gridSnap.size],
    [gridSnap.size],
  );

  const onDragOver = useCallback(
    (event: DragEvent) => {
      if (isViewRun) return;
      if (!event.dataTransfer.types.includes(STEP_KIND_DND_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [isViewRun],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      if (isViewRun) return;
      const kindId = event.dataTransfer.getData(STEP_KIND_DND_MIME);
      if (!kindId) return;
      const kind = getKindMeta(kindId);
      if (!kind) return;
      event.preventDefault();
      const flowPos = screenToFlowPosition(
        { x: event.clientX, y: event.clientY },
        gridSnap.enabled
          ? { snapToGrid: true, snapGrid }
          : undefined,
      );
      addStep(kind, {
        x: flowPos.x - AUTO_LAYOUT_DEFAULT_WIDTH / 2,
        y: flowPos.y - AUTO_LAYOUT_DEFAULT_HEIGHT / 2,
      });
    },
    [isViewRun, gridSnap.enabled, snapGrid, screenToFlowPosition, addStep],
  );

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
      setTemplateId: handleTemplateIdChange,
      setVersion: handleVersionChange,
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
    handleTemplateIdChange,
    handleVersionChange,
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

  // Sauvegarde / publication + modales de fin (champs requis, confirmation de
  // publication). Compose les fonctions pures `buildTemplateDraft` /
  // `validateTemplateDraft` (graph/build-draft) avec le state de l'éditeur.
  const {
    handleSave,
    handlePublish,
    confirmPublish,
    handleMissingFieldsConfirm,
    missingFieldsModal,
    setMissingFieldsModal,
    publishConfirmOpen,
    setPublishConfirmOpen,
  } = useTemplateSave({
    nodes,
    edges,
    variables,
    templateId,
    version,
    name,
    description,
    entryStepId,
    status,
    byKind,
    subTemplates,
    refinementResolver,
    isNew,
    uri,
    rf,
    services,
    api,
    queryClient,
    t,
    setStatus,
    setError,
    setName,
    setTemplateId,
    setVersion,
    setBusy,
  });

  // Export du workflow : SVG / PNG (rendus client) + JSON (réexport persisté).
  // Les appels `window.api.system.save*` portent leur `eslint-disable` dans le
  // hook (cf. ARCHITECTURE.md §9.4-9.5).
  const { handleExportSvg, handleExportPng, handleExportJson } =
    useWorkflowExport({ rf, byKind, variables, name, editingRef, services, t });

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
        <TemplateEditorToolbar
          nodes={nodes}
          edges={edges}
          editingRef={editingRef}
          status={status}
          busy={busy}
          launch={launch}
          canLaunch={canLaunch}
          hasMissingDeps={hasMissingDeps}
          missingDeps={missingDeps}
          notesVisible={notesVisible}
          setNotesVisible={setNotesVisible}
          groupDrawingMode={groupDrawingMode}
          setGroupDrawingMode={setGroupDrawingMode}
          gridSnap={gridSnap}
          isMaximized={isMaximized}
          setIsMaximized={setIsMaximized}
          variables={variables}
          setVariableModal={setVariableModal}
          setMissingDepsModalOpen={setMissingDepsModalOpen}
          handleLaunchOpen={handleLaunchOpen}
          handleLaunchClose={handleLaunchClose}
          handleAutoLayout={handleAutoLayout}
          addStickyNote={addStickyNote}
          addStep={addStep}
          handleExportJson={handleExportJson}
          handleExportSvg={handleExportSvg}
          handleExportPng={handleExportPng}
          handleSave={handleSave}
          handlePublish={handlePublish}
          handleClearAll={handleClearAll}
        />
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
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              onNodeDragStop={isViewRun ? undefined : handleNodeDragStop}
              onMoveEnd={isViewRun ? undefined : layoutAutosave.onMoveEnd}
              snapToGrid={gridSnap.enabled}
              snapGrid={snapGrid}
              onDragOver={onDragOver}
              onDrop={onDrop}
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
        <TemplateCanvasOverlays
          isViewRun={isViewRun}
          groupDrawingMode={groupDrawingMode}
          onOverlayPointerDown={onOverlayPointerDown}
          onOverlayPointerMove={onOverlayPointerMove}
          onOverlayPointerUp={onOverlayPointerUp}
          layoutSaveError={layoutSaveError}
          pendingConnect={pendingConnect}
          suggestions={suggestions}
          handleSuggestionPick={handleSuggestionPick}
          setPendingConnect={setPendingConnect}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          inspectorWidth={inspectorWidth}
          inspectorDragWidth={inspectorDragWidth}
          onInspectorResizeStart={onInspectorResizeStart}
          onInspectorResizeMove={onInspectorResizeMove}
          onInspectorResizeEnd={onInspectorResizeEnd}
        />
      </div>
      <TemplateEditorModals
        missingDepsModalOpen={missingDepsModalOpen}
        setMissingDepsModalOpen={setMissingDepsModalOpen}
        missingDeps={missingDeps}
        missingFieldsModal={missingFieldsModal}
        setMissingFieldsModal={setMissingFieldsModal}
        handleMissingFieldsConfirm={handleMissingFieldsConfirm}
        publishConfirmOpen={publishConfirmOpen}
        setPublishConfirmOpen={setPublishConfirmOpen}
        confirmPublish={confirmPublish}
        name={name}
        templateId={templateId}
        version={version}
        busy={busy}
        variableModal={variableModal}
        setVariableModal={setVariableModal}
        variables={variables}
        steps={steps}
        addVariable={addVariable}
        updateVariable={updateVariable}
        deleteVariable={deleteVariable}
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
