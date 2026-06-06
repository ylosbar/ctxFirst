/**
 * Propriétaire de l'identité du template :
 * `name` / `templateId` / `version` / `description` / `status`.
 *
 * Regroupe les setters bruts (consommés par le chargement initial et le save)
 * et les 3 callbacks dérivés :
 *   - `persistName` — rename inline (TemplateTitleBar) : met à jour l'état local
 *     ET persiste en base (`renameWorkflowTemplate`, rename-in-place). Pour un
 *     template neuf/dupliqué (`editingRef` null) on ne persiste pas — le nom
 *     sera écrit au 1er Save. En view-run, le callback n'est pas branché ;
 *   - `handleTemplateIdChange` / `handleVersionChange` — éditer l'ID ou la
 *     version vise une *nouvelle* ref non publiée : on rebascule `status` sur
 *     `"draft"` pour rouvrir la publication (une ref publiée est immuable).
 *
 * ⚠️ Les setters retournés sont des `useState` bruts (référentiellement
 * stables) : `useTemplateSave` les reçoit tels quels et rebâtit le draft à chaud
 * depuis ces valeurs — ne pas introduire d'indirection asynchrone qui changerait
 * le timing du flush (cf. `handleMissingFieldsConfirm`). Les deps de
 * `persistName` sont reportées à l'identique de l'ancien inline.
 */
import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";

import type { Services } from "../../../../di/services";

type Options = {
  isViewRun: boolean;
  editingRef: string | null;
  services: Services;
  queryClient: QueryClient;
  setError: Dispatch<SetStateAction<string | null>>;
};

export type TemplateIdentity = {
  name: string;
  templateId: string;
  version: string;
  description: string;
  status: "draft" | "published";
  setName: Dispatch<SetStateAction<string>>;
  setTemplateId: Dispatch<SetStateAction<string>>;
  setVersion: Dispatch<SetStateAction<string>>;
  setDescription: Dispatch<SetStateAction<string>>;
  setStatus: Dispatch<SetStateAction<"draft" | "published">>;
  persistName: (next: string) => void;
  handleTemplateIdChange: (next: string) => void;
  handleVersionChange: (next: string) => void;
};

export const useTemplateIdentity = ({
  isViewRun,
  editingRef,
  services,
  queryClient,
  setError,
}: Options): TemplateIdentity => {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [version, setVersion] = useState("v1");
  const [description, setDescription] = useState("");
  // Statut persisté du template chargé (`draft` tant qu'on écrit, `published`
  // une fois figé). Sert à savoir si la publication est encore possible : une
  // ref publiée est immuable, on itère en bumpant la version (ce qui repasse le
  // statut à `draft`, cf. `handleTemplateIdChange` / `handleVersionChange`).
  const [status, setStatus] = useState<"draft" | "published">("draft");

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
    [isViewRun, editingRef, services, queryClient, setError],
  );

  const handleTemplateIdChange = useCallback((next: string) => {
    setTemplateId(next);
    setStatus("draft");
  }, []);

  const handleVersionChange = useCallback((next: string) => {
    setVersion(next);
    setStatus("draft");
  }, []);

  return {
    name,
    templateId,
    version,
    description,
    status,
    setName,
    setTemplateId,
    setVersion,
    setDescription,
    setStatus,
    persistName,
    handleTemplateIdChange,
    handleVersionChange,
  };
};
