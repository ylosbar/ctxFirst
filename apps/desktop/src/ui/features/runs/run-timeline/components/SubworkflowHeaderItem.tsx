import { Boxes, ChevronDown, ChevronRight } from "lucide-react";
import { useT } from "../../../../i18n";
import { indentStyle } from "../parts/indent";

type SubworkflowHeaderProps = {
  readonly prefix: string;
  readonly count: number;
  readonly depth: number;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
};

/**
 * Collapsible header for an inlined sub-workflow group (§11c). Collapsed by
 * default-able via the chevron; shows the originating `workflow.call` id and
 * the number of inlined steps. Indistinguishable from a native group at
 * runtime — purely a renderer-side provenance box.
 */
const SubworkflowHeaderItem = ({
  prefix,
  count,
  depth,
  collapsed,
  onToggle,
}: SubworkflowHeaderProps) => {
  const t = useT();
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
      <div
        style={indentStyle(depth)}
        className="flex w-full items-center gap-1.5 bg-muted/20 py-1.5 pr-3 transition-colors hover:bg-muted/40"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="-m-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Chevron className="size-4" aria-hidden />
        </button>
        <Boxes className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-xs text-foreground">{`⊞ ${prefix}`}</span>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {`· ${t("runs.timeline.subworkflowStepCount", { count })}`}
        </span>
      </div>
  );
};

export default SubworkflowHeaderItem;
