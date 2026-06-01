import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useT } from "../../i18n";
import { formatRelative } from "../schedules/format-relative";
import { humanizeCron } from "../schedules/humanize-cron";
import type { OverviewCard } from "./overview-types";

type ScheduleCard = Extract<OverviewCard, { kind: "schedule" }>;

type Props = {
  readonly card: ScheduleCard;
  readonly now: number;
  readonly onOpen: () => void;
};

const OverviewScheduleCard = ({ card, now, onOpen }: Props) => {
  const t = useT();
  const { schedule } = card;
  const cron = humanizeCron(schedule.cron) ?? schedule.cron;
  return (
    <div
      onClick={onOpen}
      className={cn(
        "group relative cursor-pointer select-none rounded-md border border-border bg-background p-2 shadow",
        "hover:border-foreground/30 hover:shadow-md",
      )}
    >
      <div className="mb-1.5 flex items-center gap-1">
        <Clock className="size-3.5 text-muted-foreground" />
        <Badge tone="neutral" size="sm">
          {t("overview.scheduleCard.scheduled")}
        </Badge>
      </div>
      <div className="text-xs font-medium leading-snug">{schedule.name}</div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {cron}
        {schedule.nextRunAt
          ? t("overview.scheduleCard.nextRun", {
              relative: formatRelative(schedule.nextRunAt, now),
            })
          : null}
      </p>
    </div>
  );
};

export default OverviewScheduleCard;
