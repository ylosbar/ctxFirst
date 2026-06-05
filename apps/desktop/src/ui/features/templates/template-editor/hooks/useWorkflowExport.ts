/**
 * Export du workflow : SVG, PNG (rendus client depuis le graphe React Flow) et
 * JSON (réexport du template persisté via le service).
 *
 * SVG/PNG passent par `window.api.system.save*` — un appel `window.api` direct
 * hors `infrastructure/electron/`, donc couvert par un `eslint-disable
 * no-restricted-syntax` + TODO de dette (cf. ARCHITECTURE.md §9.4-9.5). Ces
 * disables **voyagent avec le code** depuis l'orchestrateur.
 */
import { useCallback } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { toast } from "sonner";

import type { TemplateVariableDraft } from "../../../../../domain/workflow/types";
import type { Services } from "../../../../di/services";
import type { useT } from "../../../../i18n";
import {
  buildPngFileName,
  buildSvgFileName,
  renderWorkflowPng,
  renderWorkflowSvg,
} from "../../exportWorkflowSvg";
import type { ByKind } from "../graph/step-spec";

type Options = {
  rf: ReactFlowInstance;
  byKind: ByKind | null;
  variables: ReadonlyArray<TemplateVariableDraft>;
  name: string;
  /** `null` tant que le template n'a pas de ligne en base (export JSON désactivé). */
  editingRef: string | null;
  services: Services;
  t: ReturnType<typeof useT>;
};

export type WorkflowExportControls = {
  handleExportSvg: () => Promise<void>;
  handleExportPng: () => Promise<void>;
  handleExportJson: () => Promise<void>;
};

export const useWorkflowExport = ({
  rf,
  byKind,
  variables,
  name,
  editingRef,
  services,
  t,
}: Options): WorkflowExportControls => {
  const handleExportSvg = useCallback(async () => {
    try {
      const svg = renderWorkflowSvg(rf, rf.getNodes(), rf.getEdges(), {
        byKind,
        variables,
      });
      // eslint-disable-next-line no-restricted-syntax -- TODO(dette technique) : exposer `system.saveTextFile` via un port FileSystem injecté par useServices() pour rétablir l'isolation hexagonale (cf. ARCHITECTURE.md §9.4-9.5).
      const written = await window.api.system.saveTextFile({
        content: svg,
        defaultFileName: buildSvgFileName(name),
        title: "Exporter le workflow en SVG",
        filters: [{ name: "SVG", extensions: ["svg"] }],
      });
      if (written) {
        toast.success(t("template.editor.toast.exportedSvg"), {
          description: written,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t("template.editor.toast.exportSvgFailed"), {
        description: message,
      });
    }
  }, [name, rf, byKind, variables, t]);

  const handleExportPng = useCallback(async () => {
    try {
      const png = await renderWorkflowPng(rf, rf.getNodes(), rf.getEdges(), {
        byKind,
        variables,
      });
      // eslint-disable-next-line no-restricted-syntax -- TODO(dette technique) : exposer `system.saveBinaryFile` via un port FileSystem injecté par useServices() pour rétablir l'isolation hexagonale (cf. ARCHITECTURE.md §9.4-9.5).
      const written = await window.api.system.saveBinaryFile({
        content: png,
        defaultFileName: buildPngFileName(name),
        title: "Exporter le workflow en PNG",
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (written) {
        toast.success(t("template.editor.toast.exportedPng"), {
          description: written,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t("template.editor.toast.exportPngFailed"), {
        description: message,
      });
    }
  }, [name, rf, byKind, variables, t]);

  const handleExportJson = useCallback(async () => {
    if (!editingRef) return;
    try {
      const { path } = await services.exportWorkflowTemplate(editingRef);
      if (path) {
        toast.success(t("template.editor.toast.exportedJson"), {
          description: path,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(t("template.editor.toast.exportJsonFailed"), {
        description: message,
      });
    }
  }, [editingRef, services, t]);

  return { handleExportSvg, handleExportPng, handleExportJson };
};
