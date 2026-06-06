/**
 * Assemblage de la `TemplateCanvasHandle` publiée par l'éditeur.
 *
 * Ce hook est un **assembleur de memo** : il ne possède aucun des callbacks
 * (ceux-ci restent calculés par les hooks de l'orchestrateur — `useStepMutations`,
 * `useTemplateVariables`, identité…). Il agrège les dérivés + mutateurs déjà
 * calculés en l'objet handle mémoïsé que l'inspecteur consomme via le store.
 *
 * En **view-run** (`isViewRun`), les champs mutateurs sont écrasés par un `noop`
 * qui warn en dev : l'inspecteur reste branché (lecture) mais toute écriture est
 * inerte. La duplication d'antan (deux objets quasi-identiques) est collapsée en
 * un objet de base + override des seuls mutateurs.
 *
 * ⚠️ Le tableau de deps du `useMemo` est reporté **à l'identique** de l'ancien
 * inline : une entrée en trop/en moins changerait la fréquence de recréation et
 * pourrait laisser l'inspecteur agir sur un state périmé.
 */
import { useMemo } from "react";

import type { TemplateCanvasHandle } from "../../../../stores/template-canvas-store";

type Options = {
  isViewRun: boolean;
  uri: TemplateCanvasHandle["uri"];
  selectedStep: TemplateCanvasHandle["selectedStep"];
  selectedEdgeInfo: TemplateCanvasHandle["selectedEdge"];
  isSelectedEntry: TemplateCanvasHandle["isSelectedEntry"];
  steps: TemplateCanvasHandle["steps"];
  variables: TemplateCanvasHandle["variables"];
  name: string;
  templateId: string;
  version: string;
  description: string;
  persistName: TemplateCanvasHandle["setName"];
  handleTemplateIdChange: TemplateCanvasHandle["setTemplateId"];
  handleVersionChange: TemplateCanvasHandle["setVersion"];
  setDescription: TemplateCanvasHandle["setDescription"];
  addStep: TemplateCanvasHandle["addStep"];
  updateSelectedStep: TemplateCanvasHandle["updateSelectedStep"];
  deleteSelectedStep: TemplateCanvasHandle["deleteSelectedStep"];
  setSelectedAsEntry: TemplateCanvasHandle["setSelectedAsEntry"];
  toggleSelectedEdgeLoop: TemplateCanvasHandle["toggleSelectedEdgeLoop"];
  deleteSelectedEdge: TemplateCanvasHandle["deleteSelectedEdge"];
  addVariable: TemplateCanvasHandle["addVariable"];
  updateVariable: TemplateCanvasHandle["updateVariable"];
  deleteVariable: TemplateCanvasHandle["deleteVariable"];
  handleRequestCreateSkill: TemplateCanvasHandle["onRequestCreateSkill"];
};

export const useTemplateCanvasHandle = ({
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
}: Options): TemplateCanvasHandle =>
  useMemo<TemplateCanvasHandle>(() => {
    const base: TemplateCanvasHandle = {
      uri,
      mutationEnabled: !isViewRun,
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
    if (!isViewRun) return base;
    // View-run : tous les mutateurs deviennent inertes (warn-en-dev conservé).
    const noop = () => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[wf:templates] mutation ignored in view-run mode");
      }
    };
    return {
      ...base,
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
