import { ChevronDown, ChevronRight } from "lucide-react";
import { useT } from "../../../../i18n";
import type { TimelineIterationNode } from "../../timeline-types";
import { indentStyle } from "../parts/indent";

type IterationHeaderProps = {
  readonly iteration: TimelineIterationNode;
  readonly depth: number;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
};

const IterationHeaderItem = ({
  iteration,
  depth,
  collapsed,
  onToggle,
}: IterationHeaderProps) => {
  const t = useT();
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        style={indentStyle(depth)}
        className="flex w-full items-center gap-1.5 bg-muted/20 py-1.5 pr-3 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Chevron className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate text-primary">
          {t("runs.timeline.iterationHeader", { index: iteration.index })}
        </span>
      </button>
  );
};

export default IterationHeaderItem;
