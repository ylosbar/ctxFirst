/**
 * Handoff de création de skill inline depuis le StepInspector.
 *
 * Quand l'utilisateur demande la création d'un skill pour un step, on retient
 * le step en attente (`pendingSkillForStep`) et on ouvre l'éditeur de skill.
 * À la sauvegarde du nouveau skill (`onSkillCreated`), on l'auto-assigne au
 * step en attente et on refocus l'onglet du template.
 */
import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node } from "@xyflow/react";

import type { EditorUri, WorkbenchApi } from "../../../../workbench/types";
import { onSkillCreated } from "../../../skills/events";

type Options = {
  api: WorkbenchApi;
  uri: EditorUri;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  /** Snapshot d'historique posé avant l'assignation du skill créé (undoable). */
  commit: (opts?: { coalesceKey?: string }) => void;
};

export type SkillHandoffControls = {
  /** Id du step en attente d'un skill, ou `null`. */
  pendingSkillForStep: string | null;
  /** À brancher sur `StepInspector onRequestCreateSkill`. */
  handleRequestCreateSkill: (stepId: string) => void;
};

export const useSkillHandoff = ({
  api,
  uri,
  setNodes,
  commit,
}: Options): SkillHandoffControls => {
  const [pendingSkillForStep, setPendingSkillForStep] = useState<string | null>(
    null,
  );

  const handleRequestCreateSkill = useCallback(
    (stepId: string) => {
      setPendingSkillForStep(stepId);
      api.openEditor("skill://new", { focus: true });
    },
    [api],
  );

  // Subscribe to skill:created events. When a handoff is pending, auto-assign
  // the newly created skill to the waiting step and refocus the template tab.
  useEffect(() => {
    return onSkillCreated((ref) => {
      if (!pendingSkillForStep) return;
      commit();
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== pendingSkillForStep || n.type !== "step") return n;
          const data = n.data;
          const config = (data["config"] ?? {}) as Record<string, unknown>;
          return {
            ...n,
            data: { ...data, config: { ...config, skillRef: ref } },
          };
        }),
      );
      api.openEditor(uri, { focus: true });
      setPendingSkillForStep(null);
    });
  }, [pendingSkillForStep, api, uri, setNodes, commit]);

  return { pendingSkillForStep, handleRequestCreateSkill };
};
