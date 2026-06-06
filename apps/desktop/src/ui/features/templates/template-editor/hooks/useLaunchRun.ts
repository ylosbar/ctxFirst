/**
 * Lancement d'un run depuis le template (dialogue `LaunchRunDialog`).
 *
 * Dérive l'étape d'entrée (`launchEntryStep`), le besoin de seed (un entry
 * `user.input` exige une saisie) et le kind de seed attendu, puis pilote le
 * dialogue : `handleLaunchOpen` / `handleLaunchClose` / `handleLaunchSubmit`.
 * À la soumission, démarre le run via `services.startWorkflow`, bascule sur
 * l'explorer et ouvre l'éditeur du run créé.
 *
 * `canLaunch` n'est vrai que pour un template déjà persisté (`editingRef`), avec
 * une étape d'entrée et sans dépendance manquante.
 */
import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import type { TemplateVariableView } from "@shared/wf/types";

import {
  type ArtifactKind,
  type TemplateStepDraft,
  type TemplateVariableDraft,
} from "../../../../../domain/workflow/types";
import type { Services } from "../../../../di/services";
import type { WorkbenchApi } from "../../../../workbench/types";
import { runUriFor } from "../../../runs/run-uri";
import { resolveStepSpec, type ByKind } from "../graph/step-spec";
import { stripStepUiFields } from "../graph/nodes-to-steps";

type LaunchState = {
  text: string;
  busy: boolean;
  error: string | null;
};

type Options = {
  nodes: Node[];
  entryStepId: string | null;
  byKind: ByKind | null;
  variables: ReadonlyArray<TemplateVariableDraft>;
  subTemplates: Map<string, ReadonlyArray<TemplateVariableView>>;
  /** `null` tant que le template n'a pas de ligne en base. */
  editingRef: string | null;
  hasMissingDeps: boolean;
  services: Services;
  api: WorkbenchApi;
};

export type LaunchRunControls = {
  launch: LaunchState | null;
  launchEntryStep: TemplateStepDraft | null;
  launchNeedsSeed: boolean;
  launchSeedKind: ArtifactKind | null;
  canLaunch: boolean;
  setLaunch: Dispatch<SetStateAction<LaunchState | null>>;
  handleLaunchOpen: () => void;
  handleLaunchClose: () => void;
  handleLaunchSubmit: () => Promise<void>;
};

export const useLaunchRun = ({
  nodes,
  entryStepId,
  byKind,
  variables,
  subTemplates,
  editingRef,
  hasMissingDeps,
  services,
  api,
}: Options): LaunchRunControls => {
  const [launch, setLaunch] = useState<LaunchState | null>(null);

  const launchEntryStep = useMemo<TemplateStepDraft | null>(() => {
    if (!entryStepId) return null;
    const n = nodes.find((x) => x.id === entryStepId);
    if (!n) return null;
    return stripStepUiFields(n.data as unknown as TemplateStepDraft);
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

  return {
    launch,
    launchEntryStep,
    launchNeedsSeed,
    launchSeedKind,
    canLaunch,
    setLaunch,
    handleLaunchOpen,
    handleLaunchClose,
    handleLaunchSubmit,
  };
};
