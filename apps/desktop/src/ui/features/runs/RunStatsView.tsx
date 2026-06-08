import { useMemo } from "react";
import { ParentSize } from "@visx/responsive";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelBody } from "@/components/ui/panel-body";
import { useRunPanelContext } from "../../stores/run-panel-store";
import { useT } from "../../i18n";
import { buildStepStats } from "./build-step-stats";
import { buildTokenStats } from "./build-token-stats";
import GanttChart, { AXIS_HEIGHT, ROW_HEIGHT } from "./GanttChart";
import TokenChart, { TOKEN_AXIS_HEIGHT } from "./TokenChart";
import RunStatsHeader from "./RunStatsHeader";
import RunTokensHeader from "./RunTokensHeader";
import useRunTokenUsage from "./useRunTokenUsage";
import { useTickingNow } from "./useTickingNow";
import { useTimeZoom } from "./useTimeZoom";

const TOKEN_CHART_BODY = 160;

const RunStatsView = () => {
  const ctx = useRunPanelContext();
  const t = useT();
  const tickInterval =
    ctx && (ctx.instance.status === "running" || ctx.instance.status === "awaitingHuman")
      ? 1000
      : null;
  const nowMs = useTickingNow(tickInterval);

  const usage = useRunTokenUsage(ctx?.instance ?? null);

  const model = useMemo(() => {
    if (!ctx) return null;
    return buildStepStats({
      instance: ctx.instance,
      template: ctx.template,
      nowMs,
    });
  }, [ctx, nowMs]);

  const tokenModel = useMemo(() => {
    if (!ctx || !model) return null;
    return buildTokenStats({
      instance: ctx.instance,
      template: ctx.template,
      usage,
      t0Ms: model.t0Ms,
      tEndMs: model.tEndMs,
    });
  }, [ctx, model, usage]);

  // Zoom temps partagé : le Gantt et le graphe de tokens ont le même axe X, on
  // garde donc une seule fenêtre visible pour qu'ils restent alignés. Réinitialisé
  // au changement de run via l'id d'instance.
  const domainMax = model ? Math.max(model.tEndMs - model.t0Ms, 1) : 1;
  const zoom = useTimeZoom(domainMax, ctx?.instance.id);

  if (!ctx) {
    return (
      <div data-run-stats className="h-full">
        <EmptyState description="Aucun run actif." />
      </div>
    );
  }

  if (!model || model.rows.length === 0) {
    return (
      <div data-run-stats className="flex h-full min-h-0 flex-col">
        <EmptyState description="Aucune étape exécutée pour l'instant." />
        {model && model.skippedCount > 0 ? (
          <SkippedFooter count={model.skippedCount} />
        ) : null}
      </div>
    );
  }

  const chartHeight = model.rows.length * ROW_HEIGHT + AXIS_HEIGHT + 16;

  return (
    <div data-run-stats className="flex h-full min-h-0 flex-col">
      <h2 className="flex items-center justify-between border-b px-3 py-2 text-sm font-semibold text-foreground">
        {t("runs.stats.title")}
        {zoom.isZoomed ? (
          <button
            type="button"
            onClick={zoom.reset}
            className="rounded px-1.5 py-0.5 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t("runs.stats.resetZoom")}
          </button>
        ) : null}
      </h2>
      <RunStatsHeader summary={model.summary} />
      <PanelBody>
        <ParentSize parentSizeStyles={{ width: "100%" }}>
          {({ width }) => (
            <GanttChart
              width={width}
              height={chartHeight}
              model={model}
              selectedStepId={ctx.selected?.stepId ?? null}
              onSelectStep={ctx.onSelectStep}
              view={zoom.view}
              isZoomed={zoom.isZoomed}
              onZoomAtFraction={zoom.zoomAtFraction}
              onPanByFraction={zoom.panByFraction}
              onResetZoom={zoom.reset}
            />
          )}
        </ParentSize>
        {tokenModel && tokenModel.points.length > 0 ? (
          <div className="mt-4 border-t pt-3">
            <div className="mb-1 flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold text-foreground">
                {t("runs.tokens.title")}
              </h3>
              <RunTokensHeader model={tokenModel} />
            </div>
            <ParentSize parentSizeStyles={{ width: "100%" }}>
              {({ width }) => (
                <TokenChart
                  width={width}
                  height={TOKEN_CHART_BODY + TOKEN_AXIS_HEIGHT}
                  model={tokenModel}
                  selectedStepId={ctx.selected?.stepId ?? null}
                  onSelectStep={ctx.onSelectStep}
                  view={zoom.view}
                  isZoomed={zoom.isZoomed}
                  onZoomAtFraction={zoom.zoomAtFraction}
                  onPanByFraction={zoom.panByFraction}
                  onResetZoom={zoom.reset}
                />
              )}
            </ParentSize>
          </div>
        ) : null}
      </PanelBody>
      {model.skippedCount > 0 ? (
        <SkippedFooter count={model.skippedCount} />
      ) : null}
    </div>
  );
};

const SkippedFooter = ({ count }: { count: number }) => {
  const t = useT();
  return (
    <div className="border-t px-3 py-1 text-xs text-muted-foreground">
      {t("runs.skipped", { count })}
    </div>
  );
};

export default RunStatsView;
