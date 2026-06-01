import { useMemo } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { useRunPanelContext } from "../../stores/run-panel-store";
import { useWorkbench } from "../../workbench/WorkbenchProvider";
import TemplateEditor from "../templates/TemplateEditor";
import { templateUriFor } from "../templates/template-uri";
import { buildRunOverlay } from "../templates/run-overlay";

const RunGraphPanel = () => {
  const ctx = useRunPanelContext();
  const wb = useWorkbench();

  const overlay = useMemo(() => {
    if (!ctx?.template) return null;
    return buildRunOverlay(
      ctx.instance,
      ctx.template,
      ctx.selected?.stepId ?? null,
      ctx.onSelectStep,
    );
  }, [ctx?.instance, ctx?.template, ctx?.selected?.stepId, ctx?.onSelectStep]);

  if (!ctx) {
    return (
      <div data-run-graph className="h-full">
        <EmptyState description="Aucun run actif." />
      </div>
    );
  }

  if (!ctx.template || !overlay) {
    return (
      <div data-run-graph className="h-full">
        <EmptyState description="Chargement du template…" />
      </div>
    );
  }

  const editorUri = templateUriFor(
    `${ctx.instance.templateId}@${ctx.instance.templateVersion}`,
  );

  return (
    <div data-run-graph className="h-full min-h-0">
      <TemplateEditor uri={editorUri} api={wb} runOverlay={overlay} />
    </div>
  );
};

export default RunGraphPanel;
