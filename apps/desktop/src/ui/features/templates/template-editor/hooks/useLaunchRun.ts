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
import {
  collectLaunchInputs,
  type LaunchInput,
} from "../../../../../application/use-cases/collect-launch-inputs";
import type { Services } from "../../../../di/services";
import type { WorkbenchApi } from "../../../../workbench/types";
import { runUriFor } from "../../../runs/run-uri";
import { resolveStepSpec, type ByKind } from "../graph/step-spec";
import { stripStepUiFields } from "../graph/nodes-to-steps";

type LaunchState = {
  text: string;
  /** Current value per `promptAtLaunch` variable name (pre-filled from defaults). */
  values: Record<string, string>;
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
  launchInputs: ReadonlyArray<LaunchInput>;
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

  // The `promptAtLaunch` variables to collect in the dialog (§P3). Pre-filled
  // from `defaultValue`; a variable with no default is a required field.
  const launchInputs = useMemo(
    () => collectLaunchInputs({ variables }),
    [variables],
  );

  const canLaunch =
    editingRef !== null && entryStepId !== null && !hasMissingDeps;

  const handleLaunchOpen = useCallback(() => {
    if (!canLaunch) return;
    const values = Object.fromEntries(
      launchInputs.map((i) => [i.name, i.defaultValue ?? ""]),
    );
    setLaunch({ text: "", values, busy: false, error: null });
  }, [canLaunch, launchInputs]);

  const handleLaunchClose = useCallback(() => setLaunch(null), []);

  const handleLaunchSubmit = useCallback(async () => {
    if (!launch || !editingRef) return;
    if (launchNeedsSeed && launch.text.trim().length === 0) return;
    // A required launch input left empty blocks the submit (mirrors the
    // dialog's disabled state; defends if it is bypassed).
    const missingRequired = launchInputs.some(
      (i) => i.required && (launch.values[i.name] ?? "").trim().length === 0,
    );
    if (missingRequired) return;
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
    const variableValues = launchInputs.map((i) => ({
      name: i.name,
      content: launch.values[i.name] ?? "",
    }));
    setLaunch({ ...launch, busy: true, error: null });
    try {
      const result = await services.startWorkflow({
        templateRef: editingRef,
        seeds,
        ...(variableValues.length ? { variableValues } : {}),
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
  }, [launch, editingRef, launchNeedsSeed, launchSeedKind, launchInputs, services, api]);

  return {
    launch,
    launchEntryStep,
    launchNeedsSeed,
    launchSeedKind,
    launchInputs,
    canLaunch,
    setLaunch,
    handleLaunchOpen,
    handleLaunchClose,
    handleLaunchSubmit,
  };
};
