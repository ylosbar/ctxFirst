/**
 * Surface de rendu du graphe : `<ReactFlow>` + ses décorations (double grille,
 * minimap, contrôles), les 3 providers de contexte des nodes
 * (`NotesVisibility` / `GroupActions` / `StickyNoteActions`) et les overlays
 * (`TemplateCanvasOverlays`) partageant le même `flowWrapperRef`.
 *
 * Purement **présentationnel** : aucune logique métier ici. Les callbacks et
 * dérivés sont calculés par l'orchestrateur et passés en props. La signature est
 * large par nature (≈25 props) — d'où le regroupement des familles `handlers`
 * (events `<ReactFlow>`) et `overlays` (props de `TemplateCanvasOverlays`).
 *
 * ⚠️ Les gardes `isViewRun ? undefined : handler` des props ReactFlow vivent
 * **dans** ce composant (on reçoit `isViewRun` + les handlers bruts) pour ne pas
 * dupliquer les ternaires au call site, et ne pas changer la référence de prop
 * entre modes au-delà de ce que faisait l'inline.
 */
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type Viewport,
} from "@xyflow/react";
import type { ComponentProps, RefObject } from "react";

import type { CanvasModeFlowProps } from "../hooks/useCanvasMode";

import StepNode, {
  NotesVisibilityProvider,
} from "../../../../components/templates/StepNode";
import StartNode from "../../../../components/templates/StartNode";
import VariableNode from "../../../../components/templates/VariableNode";
import GroupNode, {
  GroupActionsProvider,
} from "../../../../components/templates/GroupNode";
import StickyNoteNode, {
  StickyNoteActionsProvider,
} from "../../../../components/templates/StickyNoteNode";
import SelfLoopEdge from "../../../../components/templates/SelfLoopEdge";
import StepEdge from "../../../../components/templates/StepEdge";
import {
  minimapNodeColor,
  minimapNodeStrokeColor,
} from "../graph/edge-style";
import TemplateCanvasOverlays from "./TemplateCanvasOverlays";
import type { CanvasHandlers } from "../hooks/useCanvasHandlers";
import type { EdgeDropControls } from "../hooks/useEdgeDropSuggestions";
import type { NodeReparentingControls } from "../hooks/useNodeReparenting";

const nodeTypes = {
  step: StepNode,
  start: StartNode,
  variable: VariableNode,
  group: GroupNode,
  stickyNote: StickyNoteNode,
} as const;
const edgeTypes = { selfLoop: SelfLoopEdge, step: StepEdge } as const;

type Handlers = {
  onNodesChange: CanvasHandlers["onNodesChange"];
  onEdgesChange: CanvasHandlers["onEdgesChange"];
  isValidConnection: CanvasHandlers["isValidConnection"];
  onConnect: EdgeDropControls["onConnect"];
  onConnectStart: EdgeDropControls["onConnectStart"];
  onConnectEnd: EdgeDropControls["onConnectEnd"];
  onNodeClick: CanvasHandlers["onNodeClick"];
  onNodeDoubleClick: CanvasHandlers["onNodeDoubleClick"];
  onEdgeClick: CanvasHandlers["onEdgeClick"];
  onPaneClick: CanvasHandlers["onPaneClick"];
  onNodeDragStop: NodeReparentingControls["handleNodeDragStop"];
  onMoveEnd: NonNullable<ComponentProps<typeof ReactFlow>["onMoveEnd"]>;
  onDragOver: CanvasHandlers["onDragOver"];
  onDrop: CanvasHandlers["onDrop"];
};

type Props = {
  readonly flowWrapperRef: RefObject<HTMLDivElement>;
  readonly isViewRun: boolean;
  readonly notesVisible: ComponentProps<typeof NotesVisibilityProvider>["value"];
  readonly groupActions: ComponentProps<typeof GroupActionsProvider>["value"];
  readonly stickyActions: ComponentProps<
    typeof StickyNoteActionsProvider
  >["value"];
  readonly displayNodes: Node[];
  readonly displayEdges: Edge[];
  readonly snapToGrid: boolean;
  readonly snapGrid: CanvasHandlers["snapGrid"];
  readonly defaultViewport: Viewport | undefined;
  // Outil de canvas (drag/select) dérivé en amont — pilote le geste de
  // left-drag (pan vs box-selection) sans toucher aux autres handlers.
  readonly panOnDrag: CanvasModeFlowProps["panOnDrag"];
  readonly selectionOnDrag: CanvasModeFlowProps["selectionOnDrag"];
  readonly selectionMode: CanvasModeFlowProps["selectionMode"];
  readonly handlers: Handlers;
  readonly overlays: ComponentProps<typeof TemplateCanvasOverlays>;
};

const TemplateCanvas = ({
  flowWrapperRef,
  isViewRun,
  notesVisible,
  groupActions,
  stickyActions,
  displayNodes,
  displayEdges,
  snapToGrid,
  snapGrid,
  defaultViewport,
  panOnDrag,
  selectionOnDrag,
  selectionMode,
  handlers,
  overlays,
}: Props) => (
  <div ref={flowWrapperRef} className="relative flex min-h-0 min-w-0 flex-1">
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
            onNodesChange={isViewRun ? undefined : handlers.onNodesChange}
            onEdgesChange={isViewRun ? undefined : handlers.onEdgesChange}
            onConnect={isViewRun ? undefined : handlers.onConnect}
            onConnectStart={isViewRun ? undefined : handlers.onConnectStart}
            onConnectEnd={isViewRun ? undefined : handlers.onConnectEnd}
            isValidConnection={
              isViewRun ? undefined : handlers.isValidConnection
            }
            nodesDraggable={!isViewRun}
            nodesConnectable={!isViewRun}
            deleteKeyCode={isViewRun ? null : "Delete"}
            onNodeClick={handlers.onNodeClick}
            onNodeDoubleClick={handlers.onNodeDoubleClick}
            onEdgeClick={handlers.onEdgeClick}
            onPaneClick={handlers.onPaneClick}
            onNodeDragStop={isViewRun ? undefined : handlers.onNodeDragStop}
            onMoveEnd={isViewRun ? undefined : handlers.onMoveEnd}
            // Tolérance de clic. React Flow câble la sélection d'une node ET le
            // déclenchement de `onNodeClick` (→ inspecteur) sur le *même*
            // événement `click` DOM. Or d3-drag supprime ce `click` natif dès
            // que le pointeur bouge de plus de `nodeClickDistance` px entre le
            // press et le release — et le défaut est **0**, donc le moindre
            // tremblement (trackpad, node `backdrop-blur` sous le curseur)
            // avalait le clic : ni focus, ni inspecteur, d'où l'impression
            // qu'il faut cliquer 2-3 fois. On élargit la tolérance, et on monte
            // `nodeDragThreshold` à la même valeur pour qu'un micro-mouvement
            // sous ce seuil ne démarre pas non plus un drag accidentel.
            nodeClickDistance={5}
            nodeDragThreshold={5}
            snapToGrid={snapToGrid}
            snapGrid={snapGrid}
            panOnDrag={panOnDrag}
            selectionOnDrag={selectionOnDrag}
            selectionMode={selectionMode}
            onDragOver={handlers.onDragOver}
            onDrop={handlers.onDrop}
            fitView={!defaultViewport}
            defaultViewport={defaultViewport}
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
    <TemplateCanvasOverlays {...overlays} />
  </div>
);

export default TemplateCanvas;
