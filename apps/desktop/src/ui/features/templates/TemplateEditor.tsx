import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { TemplateLayout } from "@shared/wf/layout";
import { useT } from "../../i18n";
import { useServices } from "../../di/services-provider";
import { type TemplateStepDraft } from "../../../domain/workflow/types";
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
import { getKindMeta } from "../../components/templates/step-kinds";
import useNodeSpecs from "../../hooks/useNodeSpecs";
import type { EditorUri, WorkbenchApi } from "../../workbench/types";
import { useTemplateEditorGridSnap } from "../../workbench/store";
import {
  fromRefFromTemplateUri,
  refFromTemplateUri,
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
import { useDisplayGraph } from "./template-editor/hooks/useDisplayGraph";
import { useCanvasHandlers } from "./template-editor/hooks/useCanvasHandlers";
import TemplateEditorToolbar from "./template-editor/components/TemplateEditorToolbar";
import TemplateEditorModals from "./template-editor/components/TemplateEditorModals";
import TemplateCanvasOverlays from "./template-editor/components/TemplateCanvasOverlays";
import type { VariableModalState } from "./template-editor/components/variable-modal";
import type { RunOverlay } from "./run-overlay";
import {
  isSyntheticId,
  makeStepId,
} from "./template-editor/graph/ids";
import { templateToGraph } from "./template-editor/graph/template-to-graph";
import {
  buildDefaultStep,
  type ByKind,
} from "./template-editor/graph/step-spec";
import {
  minimapNodeColor,
  minimapNodeStrokeColor,
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
    flowWrapperRef,
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
