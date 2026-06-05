/**
 * Connexion d'edges + suggestions au drop sur le vide.
 *
 * Gère le cycle de création d'une transition :
 *   - `onConnect` — crée l'edge (self-loop vs step) au branchement de deux ports ;
 *   - `onConnectStart` / `onConnectEnd` — mémorisent l'origine du drag et, si le
 *     drop tombe sur le vide (connexion invalide), ouvrent le menu `pendingConnect`
 *     positionné sous le curseur ;
 *   - `suggestions` — la liste des kinds compatibles avec le port d'origine
 *     (typabilité §2 via `transitionTypable` + resolver de raffinement) ;
 *   - `handleSuggestionPick` — matérialise le step choisi + l'edge vers/depuis
 *     l'origine, en respectant le sens (source/target) du drag.
 *
 * `counterRef` est partagé avec `addStep` (orchestrateur) → fourni en option,
 * pas possédé par le hook.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";
import {
  addEdge,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type OnConnectStartParams,
} from "@xyflow/react";

import { resolveNodeSpec } from "@shared/wf/resolve-node-spec";
import { transitionTypable } from "@shared/wf/port-accepts";
import type {
  ArtifactKind,
  TemplateStepDraft,
  TemplateVariableDraft,
} from "../../../../../domain/workflow/types";
import type { TemplateVariableView } from "@shared/wf/types";
import {
  STEP_KIND_CATALOG,
} from "../../../../components/templates/step-kinds";
import type { EdgeDropSuggestion } from "../../../../components/templates/EdgeDropSuggestions";
import { START_NODE_ID, highestCounterForKind, makeStepId } from "../graph/ids";
import { buildDefaultStep, resolveStepSpec, type ByKind } from "../graph/step-spec";
import { edgeStyle, type EdgeData } from "../graph/edge-style";

type PendingConnect = {
  fromNodeId: string;
  handleType: "source" | "target";
  handleId: string | null;
  popupPos: { x: number; y: number };
  flowPos: { x: number; y: number };
};

type Options = {
  nodes: Node[];
  byKind: ByKind | null;
  variables: ReadonlyArray<TemplateVariableDraft>;
  subTemplates: Map<string, ReadonlyArray<TemplateVariableView>>;
  refinementResolver: (
    kind: string,
  ) => { extends: ArtifactKind | null; structuralHash: string } | null;
  screenToFlowPosition: (pos: { x: number; y: number }) => {
    x: number;
    y: number;
  };
  flowWrapperRef: RefObject<HTMLDivElement | null>;
  counterRef: MutableRefObject<number>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setEntryStepId: Dispatch<SetStateAction<string | null>>;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>;
};

export type EdgeDropControls = {
  pendingConnect: PendingConnect | null;
  setPendingConnect: Dispatch<SetStateAction<PendingConnect | null>>;
  suggestions: ReadonlyArray<EdgeDropSuggestion>;
  handleSuggestionPick: (suggestion: EdgeDropSuggestion) => void;
  onConnect: (conn: Connection) => void;
  onConnectStart: (_event: unknown, params: OnConnectStartParams) => void;
  onConnectEnd: (
    event: MouseEvent | TouchEvent,
    connectionState: FinalConnectionState,
  ) => void;
};

export const useEdgeDropSuggestions = ({
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
}: Options): EdgeDropControls => {
  const [pendingConnect, setPendingConnect] = useState<PendingConnect | null>(
    null,
  );
  const connectingFromRef = useRef<{
    nodeId: string;
    handleType: "source" | "target";
    handleId: string | null;
  } | null>(null);

  const onConnect = useCallback(
    (conn: Connection) => {
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
    },
    [setEdges],
  );

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
    [screenToFlowPosition, flowWrapperRef],
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

  return {
    pendingConnect,
    setPendingConnect,
    suggestions,
    handleSuggestionPick,
    onConnect,
    onConnectStart,
    onConnectEnd,
  };
};
