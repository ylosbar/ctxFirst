import { Badge } from "@/components/ui/badge";
import { RUN_STATUS_LABEL } from "@/components/ui/step-status";
import { cn } from "@/lib/utils";
import { useT } from "../../i18n";
import type { InstanceStatus } from "../../../domain/workflow/types";
import { formatRelative } from "../schedules/format-relative";
import RunStatusGlyph from "../runs/RunStatusGlyph";
import type { OverviewCard } from "./overview-types";

type RunCard = Extract<OverviewCard, { kind: "run" }>;

const STATUS_TONE: Record<
  InstanceStatus,
  "info" | "warning" | "success" | "danger"
> = {
  running: "info",
  awaitingHuman: "warning",
  completed: "success",
  failed: "danger",
};

type Props = {
  readonly card: RunCard;
  readonly now: number;
  readonly onOpen: () => void;
};

const OverviewRunCard = ({ card, now, onOpen }: Props) => {
  const t = useT();
  const { instance, templateName } = card;
  return (
    <div
      onClick={onOpen}
      className={cn(
        "group relative cursor-pointer select-none rounded-md border border-border bg-background p-2 shadow",
        "hover:border-foreground/30 hover:shadow-md",
      )}
    >
      <div className="mb-1.5 flex items-center gap-1">
        <RunStatusGlyph status={instance.status} />
        <Badge tone={STATUS_TONE[instance.status]} size="sm">
          {RUN_STATUS_LABEL[instance.status]}
        </Badge>
      </div>
      <div className="text-xs font-medium leading-snug">
        {templateName ?? (
          <span className="text-muted-foreground italic">
            {t("overview.runCard.unknownTemplate")}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t("overview.runCard.meta", {
          id: instance.id.slice(0, 8),
          stepCount: instance.stepCount,
          relative: formatRelative(instance.updatedAt, now),
        })}
      </p>
    </div>
  );
};

export default OverviewRunCard;
