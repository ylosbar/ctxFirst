import { useCallback } from "react";
import { AxisBottom } from "@visx/axis";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { useTooltip } from "@visx/tooltip";
import type { StepExecStatus } from "../../../domain/workflow/types";
import { STATUS_LABEL } from "@/components/ui/step-status";
import { useT } from "@/ui/i18n";
import { formatDurationMs } from "./build-step-stats";
import type { GanttBar, GanttModel } from "./run-stats-types";

export const ROW_HEIGHT = 48;
export const AXIS_HEIGHT = 24;

const MARGIN = { top: 8, right: 16, bottom: 24, left: 200 };

const STATUS_FILL: Record<StepExecStatus, string> = {
  pending: "var(--muted-foreground)",
  running: "var(--color-blue-500, #3b82f6)",
  awaitingHuman: "var(--color-amber-500, #f59e0b)",
  awaitingChild: "var(--color-amber-500, #f59e0b)",
  validated: "var(--color-emerald-500, #10b981)",
  looped: "var(--color-purple-500, #a855f7)",
  failed: "var(--destructive)",
  skipped: "var(--muted-foreground)",
  superseded: "var(--muted-foreground)",
};

const stepStatusFill = (status: StepExecStatus): string => STATUS_FILL[status];

type Props = {
  readonly width: number;
  readonly height: number;
  readonly model: GanttModel;
  readonly selectedStepId: string | null;
  readonly onSelectStep: (stepId: string) => void;
};

const GanttChart = ({
  width,
  height,
  model,
  selectedStepId,
  onSelectStep,
}: Props) => {
  const t = useT();
  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerH = Math.max(height - MARGIN.top - MARGIN.bottom, 0);

  const domainMax = Math.max(model.tEndMs - model.t0Ms, 1);

  const xScale = scaleLinear<number>({
    domain: [0, domainMax],
    range: [0, innerW],
    clamp: true,
  });
  const yScale = scaleBand<string>({
    domain: model.rows.map((r) => r.stepId),
    range: [0, innerH],
    padding: 0.25,
  });
  const bandHeight = yScale.bandwidth();

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<GanttBar>();

  const handleBarHover = useCallback(
    (bar: GanttBar, event: React.MouseEvent<SVGRectElement>) => {
      const svgRect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
      const left = svgRect ? event.clientX - svgRect.left : event.clientX;
      const top = svgRect ? event.clientY - svgRect.top : event.clientY;
      showTooltip({ tooltipData: bar, tooltipLeft: left, tooltipTop: top });
    },
    [showTooltip],
  );

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} className="block">
        <Group left={MARGIN.left} top={MARGIN.top}>
          {model.rows.map((row) => {
            const y = yScale(row.stepId) ?? 0;
            const isSelected = row.stepId === selectedStepId;
            const lastBar = row.bars[row.bars.length - 1];
            const cumulativeLabelX = lastBar
              ? xScale(lastBar.startMs + lastBar.durationMs) + 4
              : 0;
            return (
              <Group key={row.stepId} top={y}>
                <text
                  x={-8}
                  y={bandHeight / 2}
                  dy="0.35em"
                  textAnchor="end"
                  className="fill-foreground"
                  style={{ fontSize: 15 }}
                >
                  {truncate(row.label, 18)}
                </text>
                <rect
                  x={0}
                  y={bandHeight / 2 - 1}
                  width={innerW}
                  height={2}
                  className="fill-muted-foreground/10"
                />
                {row.bars.map((bar) => {
                  const x = xScale(bar.startMs);
                  const w = Math.max(xScale(bar.startMs + bar.durationMs) - x, 2);
                  return (
                    <rect
                      key={bar.stepExecId}
                      x={x}
                      y={0}
                      width={w}
                      height={bandHeight}
                      rx={2}
                      ry={2}
                      fill={stepStatusFill(bar.status)}
                      fillOpacity={bar.inProgress ? 0.55 : 0.9}
                      stroke={isSelected ? "var(--ring)" : "transparent"}
                      strokeWidth={isSelected ? 1.5 : 0}
                      style={{ cursor: "pointer" }}
                      onClick={() => onSelectStep(row.stepId)}
                      onMouseMove={(e) => handleBarHover(bar, e)}
                      onMouseLeave={hideTooltip}
                    >
                      {bar.inProgress ? (
                        <animate
                          attributeName="fill-opacity"
                          values="0.4;0.8;0.4"
                          dur="1.4s"
                          repeatCount="indefinite"
                        />
                      ) : null}
                    </rect>
                  );
                })}
                {row.bars.length > 1 && lastBar ? (
                  <text
                    x={cumulativeLabelX}
                    y={bandHeight / 2}
                    dy="0.35em"
                    textAnchor="start"
                    className="fill-muted-foreground"
                    style={{ fontSize: 13 }}
                  >
                    {t("runs.gantt.cumulative", {
                      duration: formatDurationMs(row.cumulativeMs),
                    })}
                  </text>
                ) : null}
              </Group>
            );
          })}
          <AxisBottom
            top={innerH}
            scale={xScale}
            numTicks={4}
            tickFormat={(v) => formatDurationMs(Number(v))}
            stroke="var(--border)"
            tickStroke="var(--border)"
            tickLabelProps={() => ({
              fill: "var(--muted-foreground)",
              fontSize: 13,
              textAnchor: "middle",
            })}
          />
        </Group>
      </svg>
      {tooltipOpen && tooltipData ? (
        <div
          style={{
            position: "absolute",
            top: (tooltipTop ?? 0) + 12,
            left: (tooltipLeft ?? 0) + 12,
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 8px",
            fontSize: 11,
            lineHeight: 1.3,
            pointerEvents: "none",
            zIndex: 10,
            boxShadow: "0 1px 2px rgb(0 0 0 / 0.1)",
            maxWidth: 240,
          }}
        >
          <BarTooltip bar={tooltipData} />
        </div>
      ) : null}
    </div>
  );
};

const BarTooltip = ({ bar }: { bar: GanttBar }) => {
  const t = useT();
  return (
    <div>
      <div style={{ fontWeight: 500 }}>{bar.label}</div>
      <div style={{ opacity: 0.7 }}>
        {STATUS_LABEL[bar.status]}
        {t("runs.gantt.tooltipSeparator")}
        {formatDurationMs(bar.durationMs)}
        {bar.inProgress ? t("runs.gantt.tooltipInProgress") : ""}
      </div>
      {bar.error ? (
        <div style={{ marginTop: 4, color: "var(--destructive)" }}>
          {bar.error}
        </div>
      ) : null}
    </div>
  );
};

const truncate = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max - 1)}…`;

export default GanttChart;
