import { ChevronDown, ChevronRight, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "../../../../i18n";
import type { TimelineLoopNode } from "../../timeline-types";
import { indentStyle } from "../parts/indent";

type LoopHeaderProps = {
  readonly loop: TimelineLoopNode;
  readonly depth: number;
  readonly collapsed: boolean;
  readonly isSelected: boolean;
  readonly onToggle: () => void;
  readonly onSelect: () => void;
};

const LoopHeaderItem = ({
  loop,
  depth,
  collapsed,
  isSelected,
  onToggle,
  onSelect,
}: LoopHeaderProps) => {
  const t = useT();
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const inProgress = loop.collect === null;
  return (
      <div
        style={indentStyle(depth)}
        className={cn(
          "flex w-full items-center gap-1.5 py-2 pr-3 transition-colors",
          "hover:bg-muted/40",
          // Loop = structural container: a faint band reads it as a frame, not
          // a step. An in-flight loop tints blue to flag the active branch.
          inProgress ? "bg-blue-500/5" : "bg-muted/20",
          isSelected && "bg-accent ring-1 ring-ring/40 ring-inset",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="-m-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Chevron className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onSelect}
          aria-selected={isSelected}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Repeat
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground",
              inProgress && "animate-pulse text-blue-600 dark:text-blue-400",
            )}
            aria-hidden
          />
          <span className="truncate text-foreground">{loop.foreach.label}</span>
          <span className="shrink-0 text-2xs text-muted-foreground">
            {"· "}
            {t("runs.timeline.loopIterationCount", {
              count: loop.iterations.length,
            })}
          </span>
        </button>
      </div>
  );
};

export default LoopHeaderItem;
