/**
 * Handlers branchés sur `<ReactFlow>` + l'ajout de step.
 *
 * Regroupe les callbacks que l'élément canvas reçoit en props (changements de
 * nodes/edges filtrés des synthétiques, validation de connexion, clics
 * node/edge/pane, drag-and-drop depuis le picker) ainsi que `addStep` (partagé
 * avec la `TemplateCanvasHandle`) et le memo `snapGrid`.
 *
 * Invariants préservés (cf. spec template-editor-refactor §Garde-fous) :
 *   - les callbacks sont mémoïsés pour ne pas donner de nouvelles références à
 *     React Flow à chaque frame ; les tableaux de deps sont reportés **à
 *     l'identique** depuis l'ancien inline ;
 *   - la garde `isViewRun` vit *à l'intérieur* de chaque callback (early-return),
 *     jamais en ternaire externe, pour garder la référence stable entre modes ;
 *   - `isValidConnection` lit `nodesRef`/`edgesRef` (miroirs du state) pour rester
 *     référentiellement stable pendant le drag.
 */
import { useCallback, useMemo, type DragEvent } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeMouseHandler,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";

import { transitionTypable } from "@shared/wf/port-accepts";
import type {
  ArtifactKind,
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../../../domain/workflow/types";
import type { RunOverlay } from "../../run-overlay";
import type { WorkbenchApi } from "../../../../workbench/types";
import {
  getKindMeta,
  type StepKindMeta,
} from "../../../../components/templates/step-kinds";
import { STEP_KIND_DND_MIME } from "../../picker-dnd";
import { templateUriFor } from "../../template-uri";
import {
  highestCounterForKind,
  isSyntheticId,
  makeStepId,
} from "../graph/ids";
import {
  AUTO_LAYOUT_DEFAULT_HEIGHT,
  AUTO_LAYOUT_DEFAULT_WIDTH,
} from "../graph/auto-layout";
import {
  buildDefaultStep,
  resolveStepSpec,
  type ByKind,
} from "../graph/step-spec";
import type { EdgeData } from "../graph/edge-style";
import type { SkillBodies, SubTemplates } from "../graph/display-graph";

type Options = {
  nodes: Node[];
  byKind: ByKind | null;
  variables: ReadonlyArray<TemplateVariableDraft>;
  subTemplates: SubTemplates;
  skillBodies: SkillBodies;
  refinementResolver: (
    kind: string,
  ) => { extends: ArtifactKind | null; structuralHash: string } | null;
  nodesRef: MutableRefObject<Node[]>;
  edgesRef: MutableRefObject<Edge[]>;
  screenToFlowPosition: ReactFlowInstance["screenToFlowPosition"];
  counterRef: MutableRefObject<number>;
  flowWrapperRef: RefObject<HTMLDivElement | null>;
  gridSnap: { readonly size: number; readonly enabled: boolean };
  isViewRun: boolean;
  runOverlay: RunOverlay | undefined;
  api: WorkbenchApi;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setEntryStepId: Dispatch<SetStateAction<string | null>>;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>;
};

/**
 * Entrée du template après application d'une suppression de nodes : `null` si
 * l'entrée courante figure parmi les ids retirés, inchangée sinon. Centralise la
 * réconciliation de `entryStepId` sur **tous** les chemins de suppression natifs
 * (Delete sur sélection unitaire ou au rectangle) — pure, donc testable seule.
 */
export const entryStepIdAfterRemoval = (
  removedIds: readonly string[],
  entryStepId: string | null,
): string | null =>
  entryStepId !== null && removedIds.includes(entryStepId)
    ? null
    : entryStepId;

export type CanvasHandlers = {
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  isValidConnection: (conn: Connection | Edge) => boolean;
  addStep: (kind: StepKindMeta, dropPosition?: { x: number; y: number }) => void;
  onNodeClick: NodeMouseHandler;
  onNodeDoubleClick: NodeMouseHandler;
  onEdgeClick: EdgeMouseHandler;
  onPaneClick: () => void;
  snapGrid: [number, number];
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
};

export const useCanvasHandlers = ({
  nodes,
  byKind,
  variables,
  subTemplates,
  skillBodies,
  refinementResolver,
  nodesRef,
  edgesRef,
  screenToFlowPosition,
  counterRef,
  flowWrapperRef,
  gridSnap,
  isViewRun,
  runOverlay,
  api,
  setNodes,
  setEdges,
  setEntryStepId,
  setSelectedNodeId,
  setSelectedEdgeId,
}: Options): CanvasHandlers => {
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const filtered = changes.filter(
      (c) => !("id" in c) || !isSyntheticId(c.id),
    );
    setNodes((nds) => applyNodeChanges(filtered, nds));
    // Réconciliation de l'entrée : si la node d'entrée est supprimée par le
    // chemin natif (Delete sur sélection unitaire **ou** au rectangle),
    // `entryStepId` doit retomber à `null` — sinon il reste orphelin. On lit
    // l'entrée courante via le setter fonctionnel pour garder ce callback
    // stable (deps vides). Centralise la réconciliation sur tous les chemins
    // de suppression (cf. `deleteSelectedStep`).
    const removedIds = filtered
      .filter((c) => c.type === "remove")
      .map((c) => c.id);
    if (removedIds.length > 0) {
      setEntryStepId((cur) => entryStepIdAfterRemoval(removedIds, cur));
    }
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
      const srcSpec = resolveStepSpec(srcStep, byKind, variables, subTemplates, skillBodies);
      const tgtSpec = resolveStepSpec(tgtStep, byKind, variables, subTemplates, skillBodies);
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
    [byKind, variables, subTemplates, skillBodies],
  );

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

  return {
    onNodesChange,
    onEdgesChange,
    isValidConnection,
    addStep,
    onNodeClick,
    onNodeDoubleClick,
    onEdgeClick,
    onPaneClick,
    snapGrid,
    onDragOver,
    onDrop,
  };
};
