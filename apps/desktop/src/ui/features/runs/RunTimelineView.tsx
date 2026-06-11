import { useMemo } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { useServices } from "../../di/services-provider";
import { useRunPanelContext } from "../../stores/run-panel-store";
import { useWorkbench } from "../../workbench/WorkbenchProvider";
import { useT } from "../../i18n";
import { buildTimeline } from "./build-timeline";
import RunViewHeader from "./RunViewHeader";
import RunTimelineTree from "./run-timeline/RunTimelineTree";
import SkippedFooter from "./run-timeline/components/SkippedFooter";
import { useRunTimelineActions } from "./run-timeline/hooks/useRunTimelineActions";

const RunTimelineView = () => {
  const ctx = useRunPanelContext();
  const wb = useWorkbench();
  const services = useServices();
  const t = useT();

  const instance = ctx?.instance ?? null;
  const template = ctx?.template ?? null;

  // The model is `now`-independent, so it depends only on the structural
  // inputs (`instance`/`template`) — not on `ctx` as a whole, and never on a
  // ticking clock. A run's per-second tick no longer rebuilds the tree; only
  // the in-progress row's `LiveDuration` leaf re-renders (perf P2/P4).
  const model = useMemo(
    () => (instance ? buildTimeline({ instance, template }) : null),
    [instance, template],
  );

  const { handleRerun, handleOpenInEditor, handleExport } =
    useRunTimelineActions(ctx, services, wb, t);

  if (!ctx) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <RunViewHeader templateRef={null} onOpenInEditor={null} onExport={null} />
        <EmptyState description="Aucun run actif." />
      </div>
    );
  }

  const templateRef = `${ctx.instance.templateId}@${ctx.instance.templateVersion}`;
  const selectedExecId = ctx.selected?.id ?? null;

  if (!model || model.nodes.length === 0) {
    return (
      <div className="flex h-full min-w-0 flex-col">
        <RunViewHeader
          templateRef={templateRef}
          onOpenInEditor={handleOpenInEditor}
          onExport={() => void handleExport()}
        />
        <EmptyState description="Aucune étape exécutée pour l'instant." />
        {model && model.skipped.length > 0 ? (
          <SkippedFooter skipped={model.skipped} onSelect={ctx.onSelectStep} />
        ) : null}
      </div>
    );
  }

  return (
    <RunTimelineTree
      model={model}
      templateRef={templateRef}
      selectedExecId={selectedExecId}
      onSelectExec={ctx.onSelectExec}
      onSelectStep={ctx.onSelectStep}
      onRerun={handleRerun}
      onOpenInEditor={handleOpenInEditor}
      onExport={() => void handleExport()}
    />
  );
};

export default RunTimelineView;
