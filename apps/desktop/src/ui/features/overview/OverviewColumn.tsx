import { ScrollArea } from "@/components/ui/scroll-area";
import { RUN_STATUS_STYLE } from "@/components/ui/step-status";
import { cn } from "@/lib/utils";
import { useT } from "../../i18n";
import type { OverviewCard, OverviewColumn as Column } from "./overview-types";
import type { OverviewColumnId } from "./overview-types";
import OverviewRunCard from "./OverviewRunCard";
import OverviewScheduleCard from "./OverviewScheduleCard";

// Liseré de couleur de statut sur l'en-tête (border-l-2). Réutilise les tokens
// RUN_STATUS_STYLE pour les colonnes de runs ; muted pour `scheduled`.
const COLUMN_BAR: Record<OverviewColumnId, string> = {
  scheduled: "bg-muted-foreground/40",
  running: RUN_STATUS_STYLE.running.bar,
  awaitingHuman: RUN_STATUS_STYLE.awaitingHuman.bar,
  error: RUN_STATUS_STYLE.failed.bar,
  completed: RUN_STATUS_STYLE.completed.bar,
};

const cardKey = (card: OverviewCard): string =>
  card.kind === "run" ? `run:${card.instance.id}` : `sch:${card.schedule.id}`;

type Props = {
  readonly column: Column;
  readonly now: number;
  readonly onOpenCard: (card: OverviewCard) => void;
};

const OverviewColumn = ({ column, now, onOpenCard }: Props) => {
  const t = useT();
  return (
    <div className="flex max-h-full w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/40">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span
          aria-hidden
          className={cn("h-3.5 w-0.5 rounded-full", COLUMN_BAR[column.id])}
        />
        <span className="flex-1 truncate text-sm font-medium">
          {column.label}
        </span>
        <span className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {column.cards.length}
        </span>
      </div>
      <ScrollArea className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        {column.cards.length === 0 ? (
          <div className="flex min-h-[60px] items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">
            {t("overview.column.empty")}
          </div>
        ) : (
          column.cards.map((card) =>
            card.kind === "run" ? (
              <OverviewRunCard
                key={cardKey(card)}
                card={card}
                now={now}
                onOpen={() => onOpenCard(card)}
              />
            ) : (
              <OverviewScheduleCard
                key={cardKey(card)}
                card={card}
                now={now}
                onOpen={() => onOpenCard(card)}
              />
            ),
          )
        )}
        {column.overflowCount > 0 ? (
          <p className="px-1 py-1 text-center text-[11px] text-muted-foreground">
            {t("overview.column.overflow", { count: column.overflowCount })}
          </p>
        ) : null}
      </ScrollArea>
    </div>
  );
};

export default OverviewColumn;
