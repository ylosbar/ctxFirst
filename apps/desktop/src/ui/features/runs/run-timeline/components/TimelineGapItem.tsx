import { Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDurationMs } from "../../build-step-stats";
import type { TimelineGap } from "../../timeline-types";
import { INDENT_STEP_REM, indentStyle } from "../parts/indent";

const TimelineGapItem = ({
  gap,
  depth,
}: {
  readonly gap: TimelineGap;
  readonly depth: number;
}) => {
  const isHumanWait = gap.kind === "humanWait";
  const Icon = isHumanWait ? Hourglass : null;
  return (
    <div
      style={indentStyle(depth, INDENT_STEP_REM)}
      className={cn(
        "flex items-center gap-2 py-1 pr-3 text-2xs",
        // Human-wait gaps share the amber/orange identity of the human family
        // (human.gate validation boxes) so a pause for a human reads at a glance.
        isHumanWait
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground",
      )}
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : <span>{"⋯"}</span>}
      <span>
        {isHumanWait ? "Attente humaine" : "Pause"}
        {" · "}
        {formatDurationMs(gap.durationMs)}
      </span>
    </div>
  );
};

export default TimelineGapItem;
