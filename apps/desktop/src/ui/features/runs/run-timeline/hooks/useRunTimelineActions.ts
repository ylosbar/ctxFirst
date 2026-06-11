import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { type useServices } from "../../../../di/services-provider";
import { type useRunPanelContext } from "../../../../stores/run-panel-store";
import { type useWorkbench } from "../../../../workbench/WorkbenchProvider";
import { type useT } from "../../../../i18n";
import { templateUriFor } from "../../../templates/template-uri";
import type { TimelineRow } from "../../timeline-types";

type RunTimelineActions = {
  readonly handleRerun: (row: TimelineRow) => void;
  readonly handleOpenInEditor: () => void;
  readonly handleExport: () => Promise<void>;
};

/**
 * The orchestrator's run-level actions — rewind/replay, open-in-editor, export —
 * plus the error toast effect. Deps are passed in (rather than read via hooks
 * here) so the call sits in the same hook-order slot it occupied inline, after
 * the timeline `model` memo: order and dependency arrays are unchanged.
 */
export const useRunTimelineActions = (
  ctx: ReturnType<typeof useRunPanelContext>,
  services: ReturnType<typeof useServices>,
  wb: ReturnType<typeof useWorkbench>,
  t: ReturnType<typeof useT>,
): RunTimelineActions => {
  const instance = ctx?.instance ?? null;

  const handleRerun = useCallback(
    (row: TimelineRow) => {
      if (!ctx) return;
      const count = ctx.rerunImpactCount(row.stepId);
      const ok = window.confirm(
        t("runs.timeline.confirmRerun", { label: row.label, count }),
      );
      if (!ok) return;
      ctx.onRerunFromNode(row.stepExecId);
    },
    [ctx, t],
  );

  const handleOpenInEditor = useCallback(() => {
    if (!instance) return;
    const templateUri = templateUriFor(
      `${instance.templateId}@${instance.templateVersion}`,
    );
    wb.openEditor(templateUri, { focus: true });
  }, [wb, instance]);

  const handleExport = useCallback(async () => {
    if (!instance) return;
    try {
      const { path } = await services.exportRun(instance.id);
      if (path) {
        toast.success("Run exporté en JSON", { description: path });
      }
    } catch (e) {
      toast.error("Export impossible", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }, [services, instance]);

  useEffect(() => {
    if (ctx?.error) {
      toast.error(ctx.error);
    }
  }, [ctx?.error]);

  return { handleRerun, handleOpenInEditor, handleExport };
};
