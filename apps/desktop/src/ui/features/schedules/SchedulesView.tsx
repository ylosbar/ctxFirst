import { Calendar, CalendarOff, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import type {
  ScheduleDraftView,
  ScheduleView,
} from "../../../domain/workflow/types";
import { useT } from "../../i18n";
import useSchedules from "../../hooks/useSchedules";
import ExplorerSection from "../explorer/ExplorerSection";
import { useTickingNow } from "../runs/useTickingNow";
import ScheduleDialog from "./ScheduleDialog";
import ScheduleRow from "./ScheduleRow";

const SEARCH_DEBOUNCE_MS = 200;
const TICK_MS = 30_000;

const matches = (s: ScheduleView, q: string): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    s.name.toLowerCase().includes(needle) ||
    s.templateRef.toLowerCase().includes(needle) ||
    s.cron.toLowerCase().includes(needle)
  );
};

type Group = {
  readonly id: "active" | "disabled";
  readonly label: string;
  readonly items: ReadonlyArray<ScheduleView>;
};

const SchedulesView = () => {
  const t = useT();
  const navigate = useNavigate();
  const {
    schedules,
    loading,
    error,
    save,
    setEnabled,
    remove,
    busy,
    mutationError,
  } = useSchedules();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleView | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(
      () => setQuery(rawQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [rawQuery]);

  const hasActive = useMemo(
    () => schedules.some((s) => s.enabled),
    [schedules],
  );
  const now = useTickingNow(hasActive ? TICK_MS : null);

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setSubmitError(null);
  };

  const openCreate = () => {
    setEditing(null);
    setSubmitError(null);
    setDialogOpen(true);
  };
  const openEdit = (s: ScheduleView) => {
    setEditing(s);
    setSubmitError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (draft: ScheduleDraftView) => {
    setSubmitError(null);
    try {
      await save(draft);
      closeDialog();
      toast.success(
        editing
          ? t("schedules.view.toastUpdated")
          : t("schedules.view.toastCreated"),
      );
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (s: ScheduleView) => {
    if (!window.confirm(t("schedules.view.deleteConfirm", { name: s.name }))) {
      return;
    }
    try {
      await remove(s.id);
      toast.success(t("schedules.view.toastDeleted"));
    } catch (e) {
      toast.error(t("schedules.view.toastDeleteError"), {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleToggle = async (s: ScheduleView) => {
    try {
      await setEnabled(s.id, !s.enabled);
    } catch (e) {
      toast.error(t("schedules.view.toastToggleError"), {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const groups = useMemo<ReadonlyArray<Group>>(() => {
    const filtered = schedules.filter((s) => matches(s, query.trim()));
    const sortByName = (a: ScheduleView, b: ScheduleView) =>
      a.name.localeCompare(b.name);
    const active = filtered
      .filter((s) => s.enabled)
      .slice()
      .sort((a, b) => {
        const an = a.nextRunAt ? Date.parse(a.nextRunAt) : Infinity;
        const bn = b.nextRunAt ? Date.parse(b.nextRunAt) : Infinity;
        return an === bn ? sortByName(a, b) : an - bn;
      });
    const disabled = filtered
      .filter((s) => !s.enabled)
      .slice()
      .sort(sortByName);
    return [
      { id: "active", label: t("schedules.view.groupActive"), items: active },
      {
        id: "disabled",
        label: t("schedules.view.groupDisabled"),
        items: disabled,
      },
    ];
  }, [schedules, query, t]);

  const hasQuery = query.trim().length > 0;
  const totalCount = schedules.length;
  const activeCount = useMemo(
    () => schedules.filter((s) => s.enabled).length,
    [schedules],
  );

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-1.5 px-3 pb-2 pt-2">
        <div className="min-w-0 flex-1">
          <SearchInput
            placeholder={t("schedules.view.searchPlaceholder")}
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={openCreate}
          aria-label={t("schedules.view.create")}
          title={t("schedules.view.create")}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {error ? <ErrorState variant="inline" message={error} /> : null}

      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex flex-col gap-2 px-3 py-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden
                className="h-12 w-full animate-pulse rounded-md bg-muted/40"
              />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <EmptyState
            icon={<Calendar />}
            title={t("schedules.view.emptyTitle")}
            description={t("schedules.view.emptyDescription")}
            actions={
              <Button size="sm" variant="outline" onClick={openCreate}>
                <Plus className="size-3.5" />
                {t("schedules.view.create")}
              </Button>
            }
          />
        ) : hasQuery &&
          groups.every((g) => g.items.length === 0) ? (
          <EmptyState
            size="sm"
            fill={false}
            description={t("schedules.view.emptySearch", {
              query: query.trim(),
            })}
          />
        ) : (
          groups.map((group) =>
            group.items.length === 0 ? null : (
              <ExplorerSection
                key={group.id}
                title={group.label}
                persistKey={`app.schedules.${group.id}`}
                defaultOpen
                forceOpen={hasQuery}
                count={group.items.length}
                leading={
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      group.id === "active"
                        ? "bg-emerald-500 dark:bg-emerald-400"
                        : "bg-muted-foreground/40",
                    )}
                  />
                }
              >
                {group.items.map((s) => (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    now={now}
                    busy={busy}
                    onEdit={() => openEdit(s)}
                    onDelete={() => void handleDelete(s)}
                    onToggle={() => void handleToggle(s)}
                    onOpenLastRun={() => {
                      if (s.lastInstanceId)
                        void navigate(`/runs/${s.lastInstanceId}`);
                    }}
                  />
                ))}
              </ExplorerSection>
            ),
          )
        )}
      </ScrollArea>

      {mutationError && !dialogOpen ? (
        <div className="border-t border-border bg-destructive/10 px-3 py-2 text-2xs text-destructive">
          {mutationError}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          {activeCount > 0 ? (
            <Calendar className="size-3 shrink-0" aria-hidden />
          ) : (
            <CalendarOff className="size-3 shrink-0" aria-hidden />
          )}
          {t("schedules.view.totalCount", { count: totalCount })}
        </span>
        {totalCount > 0 ? (
          <span className="tabular-nums">
            {t("schedules.view.activeCount", { count: activeCount })}
          </span>
        ) : null}
      </div>

      <ScheduleDialog
        open={dialogOpen}
        editing={editing}
        onClose={closeDialog}
        onSubmit={handleSubmit}
        busy={busy}
        error={submitError}
      />
    </div>
  );
};

export default SchedulesView;
