import { cn } from "@/lib/utils";
import { STATUS_STYLE } from "@/components/ui/step-status";
import { useT } from "../../../../i18n";
import type { TimelineSkipped } from "../../timeline-types";

const SkippedFooter = ({
  skipped,
  onSelect,
}: {
  readonly skipped: ReadonlyArray<TimelineSkipped>;
  readonly onSelect: (stepId: string) => void;
}) => {
  const t = useT();
  return (
  <details className="border-t bg-muted/20">
    <summary className="cursor-pointer select-none px-3 py-1.5 text-xs text-muted-foreground">
      {t("runs.skipped", { count: skipped.length })}
    </summary>
    <ul className="divide-y divide-border/40 pb-1">
      {skipped.map((s) => (
        <li key={s.stepId}>
          <button
            type="button"
            onClick={() => onSelect(s.stepId)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span
              className={cn(
                "inline-block size-2 shrink-0 rounded-full",
                STATUS_STYLE.skipped.dot,
              )}
              aria-hidden
            />
            <span className="truncate">{s.label}</span>
          </button>
        </li>
      ))}
    </ul>
  </details>
  );
};

export default SkippedFooter;
