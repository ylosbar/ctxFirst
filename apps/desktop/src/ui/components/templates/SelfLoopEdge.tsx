import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  type EdgeProps,
} from "@xyflow/react";

const LOOP_RADIUS = 90;
const LOOP_HEIGHT = 160;
const LOOP_OFFSET_VERTICAL = 280;

const SelfLoopEdge = ({
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
}: EdgeProps) => {
  const isVertical =
    sourcePosition === Position.Top ||
    sourcePosition === Position.Bottom ||
    targetPosition === Position.Top ||
    targetPosition === Position.Bottom;

  let path: string;
  let labelX: number;
  let labelY: number;
  let labelTransform: string;

  if (isVertical) {
    path = [
      `M ${sourceX} ${sourceY}`,
      `C ${sourceX + LOOP_OFFSET_VERTICAL} ${sourceY}`,
      `${targetX + LOOP_OFFSET_VERTICAL} ${targetY}`,
      `${targetX} ${targetY}`,
    ].join(" ");
    labelX = (sourceX + targetX) / 2 + LOOP_OFFSET_VERTICAL * 0.7;
    labelY = (sourceY + targetY) / 2;
    labelTransform = `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`;
  } else {
    const topY = Math.min(sourceY, targetY) - LOOP_HEIGHT;
    path = [
      `M ${sourceX} ${sourceY}`,
      `C ${sourceX + LOOP_RADIUS} ${sourceY} ${sourceX + LOOP_RADIUS} ${topY} ${sourceX} ${topY}`,
      `L ${targetX} ${topY}`,
      `C ${targetX - LOOP_RADIUS} ${topY} ${targetX - LOOP_RADIUS} ${targetY} ${targetX} ${targetY}`,
    ].join(" ");
    labelX = (sourceX + targetX) / 2;
    labelY = topY;
    labelTransform = `translate(-50%, -100%) translate(${labelX}px, ${labelY}px)`;
  }

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: labelTransform,
              pointerEvents: "all",
            }}
            className="rounded bg-background px-1 text-2xs text-muted-foreground"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
};

export default SelfLoopEdge;
