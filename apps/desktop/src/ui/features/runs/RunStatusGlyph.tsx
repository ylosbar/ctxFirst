import { Cog, Loader2 } from "lucide-react";
import { RUN_STATUS_STYLE } from "@/components/ui/step-status";
import { cn } from "@/lib/utils";
import type { InstanceStatus } from "../../../domain/workflow/types";

const ICON_TINT = "text-[var(--chart-1)]";

type Props = {
  readonly status: InstanceStatus;
  readonly className?: string;
};

const RunStatusGlyph = ({ status, className }: Props) => {
  const style = RUN_STATUS_STYLE[status];
  const icon = (
    <span
      aria-hidden
      className="relative flex size-3.5 shrink-0 items-center justify-center"
    >
      <Cog className={cn("size-3.5", ICON_TINT)} />
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background",
          style.dot,
          style.pulse && "animate-pulse",
        )}
      />
    </span>
  );
  if (status !== "running") {
    return <span className={className}>{icon}</span>;
  }
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center gap-1", className)}
    >
      <Loader2 className={cn("size-3 animate-spin", style.text)} />
      {icon}
    </span>
  );
};

export default RunStatusGlyph;
