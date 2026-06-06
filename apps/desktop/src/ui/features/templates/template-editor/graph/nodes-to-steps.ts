/**
 * Projection node → `TemplateStepDraft` : la conversion du graphe xyflow vers le
 * modèle de domaine.
 *
 * Garde uniquement les nodes de type `step` (exclut start/variable/group/
 * stickyNote et tout node synthétique) et retire les champs **UI-only** portés
 * par `node.data` pour les besoins du rendu mais qui n'appartiennent pas au
 * draft sérialisé :
 *   - `isEntry` — surbrillance « étape d'entrée » (l'entrée canonique est
 *     `entryStepId`, possédé à part) ;
 *   - `justDropped` — flag transitoire d'animation d'atterrissage
 *     ([useCanvasHandlers]), nettoyé après ~la durée de l'anim ; un Save tombant
 *     pendant cette fenêtre ne doit pas le sérialiser ;
 *   - `executionOverlay` — overlay d'exécution injecté côté affichage
 *     ([display-graph]) ; jamais présent sur l'état `nodes`, strippé par
 *     prudence pour que toute source de nodes converge sur la même projection.
 *
 * Pure (aucune closure sur le state React) → partagée par l'orchestrateur,
 * `build-draft`, `useTemplateDeps` et `useLaunchRun`, et testable unitairement.
 */
import type { Node } from "@xyflow/react";

import type { TemplateStepDraft } from "../../../../../domain/workflow/types";

type StepNodeData = TemplateStepDraft & {
  isEntry?: boolean;
  justDropped?: boolean;
  executionOverlay?: unknown;
};

/** Retire les champs UI-only d'un `node.data` de step. */
export const stripStepUiFields = (data: StepNodeData): TemplateStepDraft => {
  const {
    isEntry: _isEntry,
    justDropped: _justDropped,
    executionOverlay: _executionOverlay,
    ...rest
  } = data;
  return rest;
};

/** Projette un tableau de nodes vers ses steps de domaine (ordre préservé). */
export const nodesToSteps = (
  nodes: ReadonlyArray<Node>,
): TemplateStepDraft[] =>
  nodes
    .filter((n) => n.type === "step")
    .map((n) => stripStepUiFields(n.data as unknown as StepNodeData));
