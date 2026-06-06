/**
 * Catalogue de dépendances de l'éditeur de template + détection des deps
 * manquantes.
 *
 * Agrège les hooks de données (skills, artifact schemas, sub-templates) et en
 * dérive : la map `subTemplates` (ports de `workflow.call`), les ensembles de
 * refs disponibles, le `refinementResolver` (covariance §2 / égalité
 * content-addressed §5), et les deps manquantes du brouillon courant. Ouvre
 * automatiquement la modale de deps manquantes au 1er affichage d'un template
 * fraîchement importé (flag `postImportStore`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import type { TemplateVariableView } from "@shared/wf/types";

import {
  kindForArtifactSchema,
  type ArtifactKind,
  type TemplateStepDraft,
  type TemplateVariableDraft,
} from "../../../../../domain/workflow/types";
import useSkills from "../../../../hooks/useSkills";
import useArtifactSchemas from "../../../../hooks/useArtifactSchemas";
import useWorkflowTemplates from "../../../../hooks/useWorkflowTemplates";
import {
  collectMissingTemplateDeps,
  totalMissing as totalMissingDeps,
} from "../../../../../application/use-cases/collect-missing-template-deps";
import { postImportStore } from "../../post-import-store";
import { nodesToSteps } from "../graph/nodes-to-steps";

type Options = {
  nodes: ReadonlyArray<Node>;
  templateId: string;
  version: string;
  name: string;
  description: string;
  entryStepId: string | null;
  variables: ReadonlyArray<TemplateVariableDraft>;
  /** `null` quand le template n'a pas encore de ligne en base. */
  editingRef: string | null;
  loading: boolean;
};

export type TemplateDepsControls = {
  /** ref→variables des sous-templates, pour les ports de `workflow.call`. */
  subTemplates: Map<string, ReadonlyArray<TemplateVariableView>>;
  availableSkillRefs: Set<string>;
  availableArtifactKinds: Set<string>;
  refinementResolver: (
    kind: string,
  ) => { extends: ArtifactKind | null; structuralHash: string } | null;
  missingDeps: ReturnType<typeof collectMissingTemplateDeps>;
  hasMissingDeps: boolean;
  missingDepsModalOpen: boolean;
  setMissingDepsModalOpen: Dispatch<SetStateAction<boolean>>;
};

export const useTemplateDeps = ({
  nodes,
  templateId,
  version,
  name,
  description,
  entryStepId,
  variables,
  editingRef,
  loading,
}: Options): TemplateDepsControls => {
  const { skills: availableSkills } = useSkills();
  const { types: availableArtifactSchemas } = useArtifactSchemas();
  // `workflow.call` ports are derived from the referenced sub-template's
  // interface variables, so feed `resolveNodeSpec` a ref→variables map built
  // from the cached template list. Used by `resolveStepSpec` for canvas
  // handles, `isValidConnection`, and save-time port validation alike — without
  // it a `workflow.call` reads as portless (`[∅]`) and its edges are rejected.
  const { templates: availableTemplates } = useWorkflowTemplates();
  const subTemplates = useMemo(() => {
    const map = new Map<string, ReadonlyArray<TemplateVariableView>>();
    for (const tpl of availableTemplates) {
      map.set(
        `${tpl.id}@${tpl.version}`,
        tpl.variables.map((v) => ({
          name: v.name,
          kind: v.kind,
          role: v.role,
          description: v.description,
          defaultValue: v.defaultValue,
        })),
      );
    }
    return map;
  }, [availableTemplates]);
  const availableSkillRefs = useMemo(
    () => new Set(availableSkills.map((s) => s.ref)),
    [availableSkills],
  );
  const availableArtifactKinds = useMemo(
    () =>
      new Set(
        availableArtifactSchemas.map((t) => {
          if (t.source.kind === "user") return `user:${t.id}@${t.version}`;
          if (t.source.kind === "plugin")
            return `plugin:${t.source.pluginId}:${t.id}@${t.version}`;
          return `${t.id}@${t.version}`;
        }),
      ),
    [availableArtifactSchemas],
  );
  // Resolver consumed by `transitionTypable` / `portAccepts` for §2 covariance
  // (e.g. a `Url` producer flows into a `String` port) and §5 content-addressed
  // equality (two records with the same `structuralHash` are interchangeable).
  // Built from the cached schema list — TanStack-Query refetches it on every
  // relevant mutation so the editor reacts without a remount.
  const refinementResolver = useMemo(() => {
    type Entry = { extends: ArtifactKind | null; structuralHash: string };
    const byKindIndex = new Map<string, Entry>();
    for (const t of availableArtifactSchemas) {
      byKindIndex.set(kindForArtifactSchema(t), {
        extends: t.extends ?? null,
        structuralHash: t.structuralHash,
      });
    }
    return (kind: string) => byKindIndex.get(kind) ?? null;
  }, [availableArtifactSchemas]);
  const [missingDepsModalOpen, setMissingDepsModalOpen] = useState(false);

  const currentDraft = useMemo<{
    steps: ReadonlyArray<TemplateStepDraft>;
  } | null>(() => {
    const steps = nodesToSteps(nodes);
    return steps.length > 0 ? { steps } : null;
  }, [nodes]);

  const missingDeps = useMemo(() => {
    if (!currentDraft) return { skillRefs: [], artifactKinds: [] };
    return collectMissingTemplateDeps(
      {
        // Shape only `steps` is read by `collectMissingTemplateDeps`; the
        // narrow input lets us reuse the live `nodes` state without
        // round-tripping a full TemplateView.
        id: templateId,
        version,
        name,
        description,
        entryStep: entryStepId ?? "",
        exitSteps: [],
        steps: currentDraft.steps,
        transitions: [],
        variables,
        status: "draft",
      },
      {
        skillRefs: availableSkillRefs,
        artifactKinds: availableArtifactKinds,
      },
    );
  }, [
    currentDraft,
    templateId,
    version,
    name,
    description,
    entryStepId,
    variables,
    availableSkillRefs,
    availableArtifactKinds,
  ]);

  const hasMissingDeps = totalMissingDeps(missingDeps) > 0;

  // Track whether we've already consumed the "fresh import" flag for the
  // currently displayed ref, so the deps modal only auto-opens once even if
  // `hasMissingDeps` flips multiple times while the user creates/deletes
  // skills in another tab.
  const consumedFreshForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editingRef) return;
    if (consumedFreshForRef.current === editingRef) return;
    // Wait until the template + deps catalog have settled (i.e. at least one
    // step is loaded) before consuming the flag — otherwise we'd "consume"
    // the flag against an empty draft and never see the missing refs.
    if (loading || nodes.length === 0) return;
    consumedFreshForRef.current = editingRef;
    if (postImportStore.consume(editingRef) && hasMissingDeps) {
      setMissingDepsModalOpen(true);
    }
  }, [editingRef, loading, nodes.length, hasMissingDeps]);

  return {
    subTemplates,
    availableSkillRefs,
    availableArtifactKinds,
    refinementResolver,
    missingDeps,
    hasMissingDeps,
    missingDepsModalOpen,
    setMissingDepsModalOpen,
  };
};
