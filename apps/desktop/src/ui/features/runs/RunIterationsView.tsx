import { EmptyState } from "@/components/ui/empty-state";
import LlmSessionPanel from "../../components/LlmSessionPanel";
import HumanGatePanel from "../../components/HumanGatePanel";
import StepInfoPanel from "../../components/StepInfoPanel";
import { useRunPanelContext } from "../../stores/run-panel-store";
import { useT } from "../../i18n";

const RunIterationsView = () => {
  const ctx = useRunPanelContext();
  const t = useT();

  if (!ctx) {
    return (
      <div data-run-iterations className="h-full">
        <EmptyState description={t("runs.iterations.empty")} />
      </div>
    );
  }

  const { selected, isLlmSessionKind, showHumanGate, loopTargetStepId } = ctx;

  return (
    <div data-run-iterations className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selected ? (
          isLlmSessionKind ? (
            <LlmSessionPanel
              exec={selected}
              events={ctx.sessions[selected.id] ?? []}
              loadSession={ctx.loadSession}
              showHumanGate={showHumanGate}
              loopTargetStepId={loopTargetStepId}
              onValidate={ctx.onValidate}
              onRequestAdjustments={ctx.onRequestAdjustments}
              pastExecutions={[]}
            />
          ) : (
            <>
              <StepInfoPanel exec={selected} template={ctx.template} />
              {showHumanGate ? (
                <HumanGatePanel
                  stepExecId={selected.id}
                  loopTargetStepId={loopTargetStepId}
                  onValidate={ctx.onValidate}
                  onRequestAdjustments={ctx.onRequestAdjustments}
                />
              ) : null}
            </>
          )
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("runs.iterations.noSelection")}
          </div>
        )}
      </div>
      {ctx.error ? (
        <div className="border-t px-6 py-2 text-sm text-destructive">
          {ctx.error}
        </div>
      ) : null}
    </div>
  );
};

export default RunIterationsView;
