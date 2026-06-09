import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { TemplateLayout } from "@shared/wf/layout";
import { useT } from "../../i18n";
import { useServices } from "../../di/services-provider";
import { type TemplateStepDraft } from "../../../domain/workflow/types";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import type { EditorUri, WorkbenchApi } from "../../workbench/types";
import { useTemplateEditorGridSnap } from "../../workbench/store";
import {
  fromRefFromTemplateUri,
  refFromTemplateUri,
} from "./template-uri";
import { useRegisterTemplateCanvas } from "../../stores/template-canvas-store";
import TemplateTitleBar from "./TemplateTitleBar";
import LaunchRunDialog from "./LaunchRunDialog";
import { useLayoutAutosave } from "./useLayoutAutosave";
import { useInspectorResize } from "./template-editor/hooks/useInspectorResize";
import { useMaximize } from "./template-editor/hooks/useMaximize";
import { useSkillHandoff } from "./template-editor/hooks/useSkillHandoff";
import { useTemplateDeps } from "./template-editor/hooks/useTemplateDeps";
import { useTemplateLoad } from "./template-editor/hooks/useTemplateLoad";
import { useTemplateCanvasHandle } from "./template-editor/hooks/useTemplateCanvasHandle";
import { useGraphSelection } from "./template-editor/hooks/useGraphSelection";
import { useTemplateIdentity } from "./template-editor/hooks/useTemplateIdentity";
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
import { useDisplayGraph } from "./template-editor/hooks/useDisplayGraph";
import { useCanvasHandlers } from "./template-editor/hooks/useCanvasHandlers";
import TemplateEditorToolbar from "./template-editor/components/TemplateEditorToolbar";
import TemplateEditorModals from "./template-editor/components/TemplateEditorModals";
import TemplateCanvas from "./template-editor/components/TemplateCanvas";
import type { VariableModalState } from "./template-editor/components/variable-modal";
import type { RunOverlay } from "./run-overlay";
import { isSyntheticId } from "./template-editor/graph/ids";
import { nodesToSteps } from "./template-editor/graph/nodes-to-steps";
import { type ByKind } from "./template-editor/graph/step-spec";

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
  const { screenToFlowPosition, setCenter, getZoom } = rf;
  const specs = useNodeSpecs();

  const editingRef = refFromTemplateUri(uri);
  const fromRef = fromRefFromTemplateUri(uri);
  const isNew = editingRef === null;

  const [error, setError] = useState<string | null>(null);

  // Propriétaire de l'identité (name/id/version/description/status) + rename
  // inline persisté et rebascule du statut sur `draft` au changement d'ID/version
  // (cf. le hook). Les setters bruts alimentent le chargement et le save.
  const {
    name,
    templateId,
    version,
    description,
    status,
    setName,
    setTemplateId,
    setVersion,
    setDescription,
    setStatus,
    persistName,
    handleTemplateIdChange,
    handleVersionChange,
  } = useTemplateIdentity({
    isViewRun,
    editingRef,
    services,
    queryClient,
    setError,
  });

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
  // Propriétaire unique de la sélection (node/edge) + ses transitions. Les
  // setters bruts restent exposés pour les hooks consommateurs (migration
  // incrémentale — cf. le hook).
  const {
    selectedNodeId,
    selectedEdgeId,
    clearSelection,
    setSelectedNodeId,
    setSelectedEdgeId,
  } = useGraphSelection();
  // État des variables + mutations avec cascade dans les nodes (un renommage
  // se propage dans les `writesTo`/`readsFrom` ; une suppression purge les
  // références). `setVariables` brut sert au chargement initial du template.
  const { variables, setVariables, addVariable, updateVariable, deleteVariable } =
    useTemplateVariables({ setNodes });

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState<boolean>(!isNew || Boolean(fromRef));
  // Incrémenté par le bouton Refresh de la toolbar pour forcer `useTemplateLoad`
  // à re-fetch le template depuis le disque (cf. le hook).
  const [reloadToken, setReloadToken] = useState(0);
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

  // Chargement d'un template existant par ref, ou amorçage d'un template neuf
  // (node « User Input » d'office) / d'une copie depuis un `fromRef`. Effet à
  // I/O + setters — détaillé dans le hook (annulation au démontage incluse).
  useTemplateLoad({
    editingRef,
    fromRef,
    reloadToken,
    services,
    counterRef,
    setName,
    setTemplateId,
    setVersion,
    setStatus,
    setDescription,
    setNodes,
    setEdges,
    setEntryStepId,
    setVariables,
    setInitialLayout,
    setSelectedNodeId,
    setError,
    setLoading,
  });

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

  // Graphe d'affichage dérivé (pills variables, start node, overlay
  // d'exécution, surbrillance de la sélection) — calcul pur dans
  // graph/display-graph, mémoïsé dans le hook avec les mêmes dépendances que
  // l'ancien inline (fréquence de recalcul préservée).
  const { displayNodes, displayEdges } = useDisplayGraph({
    nodes,
    edges,
    variables,
    byKind,
    subTemplates,
    entryStepId,
    runOverlay,
  });

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

  // Recharge le template depuis le disque (re-fetch via `useTemplateLoad`).
  // Sans ref persistée il n'y a rien à recharger ; on confirme sinon car
  // l'opération écrase les éventuelles modifications non sauvegardées.
  const handleReload = useCallback(() => {
    if (editingRef === null) return;
    const ok = window.confirm(
      "Recharger le template depuis le disque ? Les modifications non sauvegardées seront perdues.",
    );
    if (!ok) return;
    clearSelection();
    setReloadToken((n) => n + 1);
  }, [editingRef, clearSelection]);

  const handleClearAll = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0) return;
    const ok = window.confirm(
      "Effacer toutes les nodes et repartir de zéro ? Cette action n'est pas réversible tant que vous n'avez pas sauvegardé.",
    );
    if (!ok) return;
    setNodes([]);
    setEdges([]);
    setEntryStepId(null);
    clearSelection();
  }, [nodes.length, edges.length, clearSelection]);

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

  // Handlers branchés sur <ReactFlow> (changements de nodes/edges, validation
  // de connexion, clics, drag-and-drop du picker) + `addStep` (partagé avec la
  // TemplateCanvasHandle) + `snapGrid`. Deps reportées à l'identique et gardes
  // `isViewRun` internes — cf. le hook.
  const {
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
  } = useCanvasHandlers({
    nodes,
    byKind,
    variables,
    subTemplates,
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
  });

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
    setCenter,
    getZoom,
    counterRef,
    setNodes,
    setEdges,
    setEntryStepId,
    setSelectedNodeId,
    setSelectedEdgeId,
  });

  const isSelectedEntry =
    entryStepId === selectedNodeId && selectedNodeId !== null;

  const steps = useMemo<ReadonlyArray<TemplateStepDraft>>(
    () => nodesToSteps(nodes),
    [nodes],
  );

  // Handle impérative publiée pour l'inspecteur (assemblage mémoïsé des dérivés
  // + mutateurs ci-dessus ; mutateurs neutralisés en view-run — cf. le hook).
  const handle = useTemplateCanvasHandle({
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
    handleRequestCreateSkill,
  });
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
          handleReload={handleReload}
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

      <TemplateCanvas
        flowWrapperRef={flowWrapperRef}
        isViewRun={isViewRun}
        notesVisible={notesVisible}
        groupActions={groupActions}
        stickyActions={stickyActions}
        displayNodes={displayNodes}
        displayEdges={displayEdges}
        snapToGrid={gridSnap.enabled}
        snapGrid={snapGrid}
        defaultViewport={initialLayout?.viewport}
        handlers={{
          onNodesChange,
          onEdgesChange,
          isValidConnection,
          onConnect,
          onConnectStart,
          onConnectEnd,
          onNodeClick,
          onNodeDoubleClick,
          onEdgeClick,
          onPaneClick,
          onNodeDragStop: handleNodeDragStop,
          onMoveEnd: layoutAutosave.onMoveEnd,
          onDragOver,
          onDrop,
        }}
        overlays={{
          isViewRun,
          groupDrawingMode,
          onOverlayPointerDown,
          onOverlayPointerMove,
          onOverlayPointerUp,
          layoutSaveError,
          pendingConnect,
          suggestions,
          handleSuggestionPick,
          setPendingConnect,
          selectedNodeId,
          selectedEdgeId,
          inspectorWidth,
          inspectorDragWidth,
          onInspectorResizeStart,
          onInspectorResizeMove,
          onInspectorResizeEnd,
        }}
      />
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
