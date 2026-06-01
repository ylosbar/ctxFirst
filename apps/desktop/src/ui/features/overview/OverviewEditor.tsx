import { LayoutGrid } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "../../i18n";
import useInstanceList from "../../hooks/useInstanceList";
import useSchedules from "../../hooks/useSchedules";
import useWorkflowTemplates from "../../hooks/useWorkflowTemplates";
import { useWorkbench } from "../../workbench/store";
import { runUriFor } from "../runs/run-uri";
import { useTickingNow } from "../runs/useTickingNow";
import { buildOverviewBoard } from "./build-overview-board";
import OverviewColumn from "./OverviewColumn";
import OverviewFilterBar, { type TemplateOption } from "./OverviewFilterBar";
import type { OverviewCard, OverviewColumnId } from "./overview-types";

// Tick local (30 s) : rafraîchit l'affichage relatif des cartes (« dans 4 min »)
// sans déclencher de refetch — les données sont déjà invalidées par
// WorkflowEventsBridge sur réception de wf:event.
const TICK_MS = 30_000;

const toggle = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

const OverviewEditor = () => {
  const t = useT();
  const { instances, loading: runsLoading, error: runsError } =
    useInstanceList("");
  const { schedules } = useSchedules();
  const { templates } = useWorkflowTemplates();
  const wb = useWorkbench();
  const now = useTickingNow(TICK_MS);

  const [query, setQuery] = useState("");
  const [templateFilter, setTemplateFilter] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [statusFilter, setStatusFilter] = useState<
    ReadonlySet<OverviewColumnId>
  >(() => new Set());

  const templatesByRef = useMemo(
    () => new Map(templates.map((t) => [`${t.id}@${t.version}`, t.name])),
    [templates],
  );

  const templateOptions = useMemo<ReadonlyArray<TemplateOption>>(
    () =>
      templates.map((t) => ({ ref: `${t.id}@${t.version}`, name: t.name })),
    [templates],
  );

  const board = useMemo(
    () =>
      buildOverviewBoard({
        instances,
        schedules,
        templatesByRef,
        templateFilter,
        statusFilter,
        query,
      }),
    [instances, schedules, templatesByRef, templateFilter, statusFilter, query],
  );

  const handleOpenCard = useCallback(
    (card: OverviewCard) => {
      if (card.kind === "run") {
        wb.openEditor(runUriFor(card.instance.id), { focus: true });
        return;
      }
      const lastInstanceId = card.schedule.lastInstanceId;
      if (lastInstanceId) {
        wb.openEditor(runUriFor(lastInstanceId), { focus: true });
        return;
      }
      wb.activateActivity("schedules");
    },
    [wb],
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setTemplateFilter(new Set());
    setStatusFilter(new Set());
  }, []);

  const scheduledCount = useMemo(
    () => schedules.filter((s) => s.enabled && s.nextRunAt != null).length,
    [schedules],
  );

  if (runsLoading && instances.length === 0) {
    return (
      <div className="flex h-full min-w-0 flex-col">
        <EmptyState
          icon={<LayoutGrid className="size-8 animate-pulse" />}
          title={t("common.loading")}
        />
      </div>
    );
  }

  if (runsError && instances.length === 0) {
    return (
      <div className="flex h-full min-w-0 flex-col">
        <EmptyState
          icon={<LayoutGrid className="size-8" />}
          title={t("overview.editor.loadError")}
          description={runsError}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 text-sm font-medium">
        <LayoutGrid className="size-4" />
        {t("overview.editor.title")}
        <span className="text-xs font-normal text-muted-foreground">
          {t("overview.editor.subtitle", {
            count: instances.length,
            scheduledCount,
          })}
        </span>
      </div>
      <OverviewFilterBar
        templates={templateOptions}
        templateFilter={templateFilter}
        statusFilter={statusFilter}
        query={query}
        onToggleTemplate={(ref) => setTemplateFilter((s) => toggle(s, ref))}
        onToggleStatus={(id) => setStatusFilter((s) => toggle(s, id))}
        onQueryChange={setQuery}
        onClear={handleClear}
      />
      <ScrollArea
        className="min-h-0 flex-1"
        options={{ overflow: { y: "hidden" } }}
      >
        <div className="flex gap-3 p-3">
          {board.map((col) => (
            <OverviewColumn
              key={col.id}
              column={col}
              now={now}
              onOpenCard={handleOpenCard}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default OverviewEditor;
