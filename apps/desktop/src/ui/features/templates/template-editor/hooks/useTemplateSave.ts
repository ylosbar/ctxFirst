/**
 * Sauvegarde / publication du template + modales de fin.
 *
 * Compose les fonctions pures `buildTemplateDraft` / `validateTemplateDraft`
 * (graph/build-draft) avec le state React de l'éditeur :
 *   - `handleSave` — valide puis persiste un brouillon ;
 *   - `handlePublish` / `confirmPublish` — valide puis ouvre la confirmation,
 *     puis persiste avec `status: "published"` (ref figée, immuable côté MCP) ;
 *   - `handleMissingFieldsConfirm` — applique les champs requis saisis dans la
 *     modale puis relance la sauvegarde avec un draft rebâti à chaud.
 *
 * Possède les états des deux modales (`missingFieldsModal`, `publishConfirmOpen`).
 * `performSave` capture aussi le 1er layout d'un template neuf (sticky notes
 * incluses via `buildTemplateLayout`).
 */
import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { TemplateLayout } from "@shared/wf/layout";
import type { TemplateVariableView } from "@shared/wf/types";
import type {
  ArtifactKind,
  TemplateDraft,
  TemplateVariableDraft,
} from "../../../../../domain/workflow/types";
import type { Services } from "../../../../di/services";
import type { EditorUri, WorkbenchApi } from "../../../../workbench/types";
import type { useT } from "../../../../i18n";
import { templateUriFor } from "../../template-uri";
import type { RequiredField as MissingRequiredField } from "../../TemplateSaveMissingModal";
import { isSyntheticId } from "../graph/ids";
import { buildTemplateLayout } from "../graph/build-layout";
import {
  buildTemplateDraft,
  validateTemplateDraft,
  type TemplateDraftOverrides,
} from "../graph/build-draft";
import type { ByKind, SkillBodies } from "../graph/step-spec";

type Options = {
  nodes: Node[];
  edges: Edge[];
  variables: ReadonlyArray<TemplateVariableDraft>;
  templateId: string;
  version: string;
  name: string;
  description: string;
  entryStepId: string | null;
  status: "draft" | "published";
  byKind: ByKind | null;
  subTemplates: Map<string, ReadonlyArray<TemplateVariableView>>;
  skillBodies: SkillBodies;
  refinementResolver: (
    kind: string,
  ) => { extends: ArtifactKind | null; structuralHash: string } | null;
  isNew: boolean;
  uri: EditorUri;
  rf: ReactFlowInstance;
  services: Services;
  api: WorkbenchApi;
  queryClient: QueryClient;
  t: ReturnType<typeof useT>;
  setStatus: Dispatch<SetStateAction<"draft" | "published">>;
  setError: Dispatch<SetStateAction<string | null>>;
  setName: Dispatch<SetStateAction<string>>;
  setTemplateId: Dispatch<SetStateAction<string>>;
  setVersion: Dispatch<SetStateAction<string>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
};

export type TemplateSaveControls = {
  handleSave: () => Promise<void>;
  handlePublish: () => void;
  confirmPublish: () => Promise<void>;
  handleMissingFieldsConfirm: (values: {
    name: string;
    id: string;
    version: string;
  }) => Promise<void>;
  missingFieldsModal: { fields: ReadonlyArray<MissingRequiredField> } | null;
  setMissingFieldsModal: Dispatch<
    SetStateAction<{ fields: ReadonlyArray<MissingRequiredField> } | null>
  >;
  publishConfirmOpen: boolean;
  setPublishConfirmOpen: Dispatch<SetStateAction<boolean>>;
};

export const useTemplateSave = ({
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
  skillBodies,
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
}: Options): TemplateSaveControls => {
  const [missingFieldsModal, setMissingFieldsModal] = useState<{
    fields: ReadonlyArray<MissingRequiredField>;
  } | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);

  const buildDraft = (overrides?: TemplateDraftOverrides): TemplateDraft =>
    buildTemplateDraft(
      {
        nodes,
        edges,
        templateId,
        version,
        name,
        description,
        entryStepId,
        variables,
        status,
      },
      overrides,
    );

  const validateDraft = (draft: TemplateDraft): string | null =>
    validateTemplateDraft(draft, {
      byKind,
      variables,
      subTemplates,
      skillBodies,
      refinementResolver,
    });

  // Snapshot du 1er save d'un template neuf (avant que l'auto-save debounced
  // ne soit actif). Délègue au builder pur partagé avec [useLayoutAutosave] —
  // ce qui inclut désormais les sticky notes, qu'une version antérieure
  // omettait (post-its perdus au 1er save d'un nouveau template).
  const buildLayoutSnapshot = useCallback(
    (): TemplateLayout =>
      buildTemplateLayout(nodes, {
        viewport: rf.getViewport(),
        updatedAt: new Date().toISOString(),
        isSynthetic: isSyntheticId,
      }),
    [nodes, rf],
  );

  const missingRequiredFields = (
    draft: TemplateDraft,
  ): ReadonlyArray<MissingRequiredField> => {
    const out: MissingRequiredField[] = [];
    if (!draft.name) out.push("name");
    if (!draft.id) out.push("id");
    if (!draft.version) out.push("version");
    return out;
  };

  const performSave = async (draft: TemplateDraft) => {
    setBusy(true);
    try {
      await services.saveWorkflowTemplate(draft);
      // Refléter le statut effectivement persisté (publication incluse) pour
      // que la toolbar passe en mode « publié » sans recharger.
      setStatus(draft.status);
      // Pour un template fraîchement créé (ou dupliqué depuis un `fromRef`),
      // l'auto-save layout est inactif tant qu'il n'y a pas de ligne cible.
      // On capture donc l'état courant ici, juste après que la ligne vient
      // d'être créée. Échec non-bloquant pour la navigation.
      if (isNew) {
        try {
          await services.saveTemplateLayout(
            `${draft.id}@${draft.version}`,
            buildLayoutSnapshot(),
          );
        } catch (e) {
          console.warn("[wf:templates] first layout save failed", e);
        }
      }
      toast.success(
        t(
          draft.status === "published"
            ? "template.editor.toast.published"
            : "template.editor.toast.saved",
        ),
        {
          description: `${draft.name} · ${draft.id}@${draft.version}`,
        },
      );
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      // Pour un template fraîchement créé, on bascule l'onglet sur l'URI
      // canonique du template (`template://<id>@<version>`) — sans ça,
      // `editingRef` resterait null et l'auto-save layout + le lancement
      // de run resteraient désactivés.
      if (isNew) {
        const savedUri = templateUriFor(`${draft.id}@${draft.version}`);
        if (savedUri !== uri) {
          api.openEditor(savedUri, { focus: true });
          api.closeEditor(uri);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    const draft = buildDraft();
    const missing = missingRequiredFields(draft);
    if (missing.length > 0) {
      setMissingFieldsModal({ fields: missing });
      return;
    }
    const local = validateDraft(draft);
    if (local) {
      setError(local);
      return;
    }
    await performSave(draft);
  };

  // Publier = sauvegarder avec `status: "published"`. On valide exactement comme
  // un Save (champs requis + structure) avant d'ouvrir la confirmation, car une
  // ref publiée est immuable côté MCP (`ctxfirst_save_template` refuse de
  // ré-écrire une ref déjà publiée — on itère en bumpant la version).
  const handlePublish = () => {
    setError(null);
    const draft = buildDraft({ status: "published" });
    const missing = missingRequiredFields(draft);
    if (missing.length > 0) {
      setMissingFieldsModal({ fields: missing });
      return;
    }
    const local = validateDraft(draft);
    if (local) {
      setError(local);
      return;
    }
    setPublishConfirmOpen(true);
  };

  const confirmPublish = async () => {
    setPublishConfirmOpen(false);
    await performSave(buildDraft({ status: "published" }));
  };

  const handleMissingFieldsConfirm = async (values: {
    name: string;
    id: string;
    version: string;
  }) => {
    // Les setters écrasent ce qui pouvait être saisi dans le panel *Template* :
    // c'est voulu — la modal est l'autorité sur ces 3 champs au moment du Save.
    setName(values.name);
    setTemplateId(values.id);
    setVersion(values.version);
    setMissingFieldsModal(null);
    setError(null);

    // On rebuilt un draft avec les valeurs fraîches plutôt que d'attendre le
    // re-render : sinon il faudrait un useEffect pour relancer la sauvegarde,
    // ce qui complique le séquencement et masque l'origine du save.
    const draft = buildDraft(values);
    const local = validateDraft(draft);
    if (local) {
      setError(local);
      return;
    }
    await performSave(draft);
  };

  return {
    handleSave,
    handlePublish,
    confirmPublish,
    handleMissingFieldsConfirm,
    missingFieldsModal,
    setMissingFieldsModal,
    publishConfirmOpen,
    setPublishConfirmOpen,
  };
};
