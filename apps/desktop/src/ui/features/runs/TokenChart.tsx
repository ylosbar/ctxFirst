import { useCallback, useRef } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { Area, AreaClosed, LinePath } from "@visx/shape";
import { useTooltip } from "@visx/tooltip";
import { useT } from "../../i18n";
import { formatDurationMs } from "./build-step-stats";
import { formatCostUsd, formatTokens } from "./build-token-stats";
import type { TokenModel, TokenPoint } from "./token-stats-types";
import { useChartGestures, type TimeView } from "./useTimeZoom";

export const TOKEN_AXIS_HEIGHT = 24;

// Marges alignées sur GanttChart (left=200, right=16) pour que l'axe temps du
// graphe de tokens se superpose exactement aux barres de la chronologie.
const MARGIN = { top: 12, right: 16, bottom: 24, left: 200 };

const IN_FILL = "var(--color-blue-500, #3b82f6)";
const OUT_FILL = "var(--color-purple-500, #a855f7)";

type Datum = { atMs: number; cumIn: number; cumTotal: number };

type Props = {
  readonly width: number;
  readonly height: number;
  readonly model: TokenModel;
  readonly selectedStepId: string | null;
  readonly onSelectStep: (stepId: string) => void;
  /** Fenêtre temps visible (zoom/pan partagés avec le Gantt). */
  readonly view: TimeView;
  readonly isZoomed: boolean;
  readonly onZoomAtFraction: (fraction: number, deltaY: number) => void;
  readonly onPanByFraction: (fraction: number) => void;
  readonly onResetZoom: () => void;
};

const TokenChart = ({
  width,
  height,
  model,
  selectedStepId,
  onSelectStep,
  view,
  isZoomed,
  onZoomAtFraction,
  onPanByFraction,
  onResetZoom,
}: Props) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerH = Math.max(height - MARGIN.top - MARGIN.bottom, 0);

  const { isPanning } = useChartGestures(svgRef, MARGIN.left, innerW, {
    zoomAtFraction: onZoomAtFraction,
    panByFraction: onPanByFraction,
  });

  const yMax = Math.max(model.totalTokens, 1);

  const xScale = scaleLinear<number>({
    domain: [view.startMs, view.endMs],
    range: [0, innerW],
    clamp: true,
  });
  const yScale = scaleLinear<number>({
    domain: [0, yMax],
    range: [innerH, 0],
    nice: true,
  });

  // Point d'origine à (0, 0) pour ancrer les aires au démarrage du run.
  const series: Datum[] = [
    { atMs: 0, cumIn: 0, cumTotal: 0 },
    ...model.points.map((p) => ({
      atMs: p.atMs,
      cumIn: p.cumIn,
      cumTotal: p.cumTotal,
    })),
  ];

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TokenPoint>();

  const handleHover = useCallback(
    (point: TokenPoint, event: React.MouseEvent<SVGCircleElement>) => {
      const svgRect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
      const left = svgRect ? event.clientX - svgRect.left : event.clientX;
      const top = svgRect ? event.clientY - svgRect.top : event.clientY;
      showTooltip({ tooltipData: point, tooltipLeft: left, tooltipTop: top });
    },
    [showTooltip],
  );

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="block"
        style={{
          cursor: isPanning ? "grabbing" : isZoomed ? "grab" : "default",
        }}
        onDoubleClick={onResetZoom}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          {/* Aire input (0 → cumIn) */}
          <AreaClosed<Datum>
            data={series}
            x={(d) => xScale(d.atMs)}
            y={(d) => yScale(d.cumIn)}
            yScale={yScale}
            fill={IN_FILL}
            fillOpacity={0.35}
            stroke={IN_FILL}
            strokeOpacity={0.6}
            strokeWidth={1}
          />
          {/* Aire output empilée (cumIn → cumTotal) */}
          <Area<Datum>
            data={series}
            x={(d) => xScale(d.atMs)}
            y0={(d) => yScale(d.cumIn)}
            y1={(d) => yScale(d.cumTotal)}
            fill={OUT_FILL}
            fillOpacity={0.3}
          />
          <LinePath<Datum>
            data={series}
            x={(d) => xScale(d.atMs)}
            y={(d) => yScale(d.cumTotal)}
            stroke={OUT_FILL}
            strokeWidth={1.5}
          />
          {model.points.map((p) => {
            // Hors fenêtre zoomée : pas de point résiduel collé au bord.
            if (p.atMs < view.startMs || p.atMs > view.endMs) return null;
            const cx = xScale(p.atMs);
            const cy = yScale(p.cumTotal);
            const isSelected = p.stepId === selectedStepId;
            return (
              <circle
                key={p.stepExecId}
                cx={cx}
                cy={cy}
                r={isSelected ? 5 : 3.5}
                fill="var(--background)"
                stroke={isSelected ? "var(--ring)" : OUT_FILL}
                strokeWidth={isSelected ? 2 : 1.5}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectStep(p.stepId)}
                onMouseMove={(e) => handleHover(p, e)}
                onMouseLeave={hideTooltip}
              />
            );
          })}
          <AxisLeft
            scale={yScale}
            numTicks={3}
            tickFormat={(v) => formatTokens(Number(v))}
            stroke="var(--border)"
            tickStroke="var(--border)"
            tickLabelProps={() => ({
              fill: "var(--muted-foreground)",
              fontSize: 12,
              textAnchor: "end",
              dx: -4,
              dy: "0.33em",
            })}
          />
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
          <PointTooltip point={tooltipData} />
        </div>
      ) : null}
    </div>
  );
};

const PointTooltip = ({ point }: { point: TokenPoint }) => {
  const t = useT();
  return (
    <div>
      <div style={{ fontWeight: 500 }}>{point.label}</div>
      <div style={{ opacity: 0.7 }}>
        {t("runs.tokens.in")} {formatTokens(point.tokensIn)}
        {" · "}
        {t("runs.tokens.out")} {formatTokens(point.tokensOut)}
        {point.costUsd != null ? ` · ${formatCostUsd(point.costUsd)}` : ""}
      </div>
      <div style={{ opacity: 0.7, marginTop: 2 }}>
        {t("runs.tokens.cumulative")} {formatTokens(point.cumTotal)}
      </div>
    </div>
  );
};

export default TokenChart;
