import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { Sparkles } from "lucide-react";

export type ParserBadgeData = {
  parserId: string;
  parserVersion: string;
  parserMode: "declarative" | "code";
};

export type StepEdgeData = {
  isLoop?: boolean;
  order?: number;
  parserBadge?: ParserBadgeData;
};

const StepEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  data,
}: EdgeProps) => {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const badge = (data as StepEdgeData | undefined)?.parserBadge;
  const showLabel = label !== undefined && label !== null && label !== "";

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {(badge || showLabel) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className="flex items-center gap-1"
          >
            {showLabel ? (
              <span className="rounded bg-background px-1 text-2xs text-muted-foreground">
                {label}
              </span>
            ) : null}
            {badge ? (
              <span
                className="flex items-center gap-1 rounded border border-violet-400/40 bg-violet-500/10 px-1.5 py-0.5 text-2xs text-violet-300"
                title={`Parser actif : ${badge.parserId}@${badge.parserVersion} (${badge.parserMode}) — appliqué automatiquement avant injection dans un step LLM`}
              >
                <Sparkles className="size-3" />
                <span className="font-mono">
                  {badge.parserId}@{badge.parserVersion}
                </span>
              </span>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default StepEdge;
