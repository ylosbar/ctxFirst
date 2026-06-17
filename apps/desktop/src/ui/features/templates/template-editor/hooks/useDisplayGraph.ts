/**
 * Compose la dérivation pure du graphe d'affichage (graph/display-graph) avec la
 * mémoïsation React. Chaque étage garde **exactement** les dépendances de
 * l'ancien inline pour préserver la fréquence de recalcul :
 *   - `variableByName`     ← [variables]
 *   - `variableArtifacts`  ← [nodes, variableByName, byKind, variables, subTemplates]
 *   - `displayNodes`       ← [nodes, entryStepId, variableArtifacts, runOverlay]
 *   - `displayEdges`       ← [edges, entryStepId, nodes, variableArtifacts, runOverlay]
 *
 * Retourne les `nodes`/`edges` finaux passés à `<ReactFlow>`.
 */
import { useMemo } from "react";
import type { Edge, Node } from "@xyflow/react";

import type { TemplateVariableDraft } from "../../../../../domain/workflow/types";
import type { RunOverlay } from "../../run-overlay";
import type { ByKind } from "../graph/step-spec";
import {
  buildDisplayEdges,
  buildDisplayNodes,
  buildVariableArtifacts,
  buildVariableByName,
  type SkillBodies,
  type SubTemplates,
} from "../graph/display-graph";

type Options = {
  nodes: Node[];
  edges: Edge[];
  variables: ReadonlyArray<TemplateVariableDraft>;
  byKind: ByKind | null;
  subTemplates: SubTemplates;
  skillBodies: SkillBodies;
  entryStepId: string | null;
  runOverlay: RunOverlay | undefined;
};

export const useDisplayGraph = ({
  nodes,
  edges,
  variables,
  byKind,
  subTemplates,
  skillBodies,
  entryStepId,
  runOverlay,
}: Options): { displayNodes: Node[]; displayEdges: Edge[] } => {
  const variableByName = useMemo(
    () => buildVariableByName(variables),
    [variables],
  );

  const variableArtifacts = useMemo<{ nodes: Node[]; edges: Edge[] }>(
    () =>
      buildVariableArtifacts(
        nodes,
        variableByName,
        byKind,
        variables,
        subTemplates,
        skillBodies,
      ),
    [nodes, variableByName, byKind, variables, subTemplates, skillBodies],
  );

  const displayNodes = useMemo<Node[]>(
    () => buildDisplayNodes(nodes, entryStepId, variableArtifacts, runOverlay),
    [nodes, entryStepId, variableArtifacts, runOverlay],
  );

  const displayEdges = useMemo<Edge[]>(
    () =>
      buildDisplayEdges(edges, entryStepId, nodes, variableArtifacts, runOverlay),
    [edges, entryStepId, nodes, variableArtifacts, runOverlay],
  );

  return { displayNodes, displayEdges };
};
