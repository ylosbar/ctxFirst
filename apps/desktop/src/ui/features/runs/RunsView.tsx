import {
  Check,
  ChevronDown,
  ChevronRight,
  Cog,
  Group,
  History,
  ListFilter,
  Plus,
} from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchInput } from "@/components/ui/search-input";
import {
  RUN_STATUS_STYLE,
  RUN_STATUS_LABEL,
} from "@/components/ui/step-status";
import { cn } from "@/lib/utils";
import type { InstanceStatus } from "../../../domain/workflow/types";
import { useServices } from "../../di/services-provider";
import useInstanceList from "../../hooks/useInstanceList";
import {
  usePinRun,
  usePinnedIds,
  useUnpinRun,
} from "../../stores/runs-store";
import {
  useRunsGroupMode,
  useRunsStatusFilter,
  useRunsViewStore,
  useSetRunsGroupMode,
  useToggleRunsStatus,
} from "../../stores/runs-view-store";
import {
  useActiveEditor,
  useEditors,
  useWorkbench,
} from "../../workbench/WorkbenchProvider";
import ExplorerSection from "../explorer/ExplorerSection";
import {
  buildRunsList,
  RUNS_STATUS_ORDER,
  type RunsGroupMode,
  type RunsListGroup,
  type RunsListItem,
} from "./build-runs-list";
import { menuItemClass, menuPopupClass } from "../explorer/menus/menu-styles";
import RunLeafMenu from "./RunLeafMenu";
import RunStatusGlyph from "./RunStatusGlyph";
import { runUriFor } from "./run-uri";
import { useTickingNow } from "./useTickingNow";
import { useT } from "../../i18n";

const SEARCH_DEBOUNCE_MS = 200;

const GROUP_MODE_OPTIONS: ReadonlyArray<{
  readonly value: RunsGroupMode;
  readonly label: string;
}> = [
  { value: "status", label: "Statut" },
  { value: "template", label: "Template" },
  { value: "none", label: "Aucun" },
];

const iconButtonClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent data-[popup-open]:text-foreground";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const formatRelativeTime = (iso: string, now: number): string => {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diff = Math.max(0, now - ts);
  if (diff < MINUTE) return `${Math.max(1, Math.floor(diff / SECOND))}s`;
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  return `${Math.floor(diff / DAY)}j`;
};

type RunRowProps = {
  readonly item: RunsListItem;
  readonly now: number;
  readonly isActive: (instanceId: string) => boolean;
  readonly isOpen: (instanceId: string) => boolean;
  readonly onPick: (instanceId: string) => void;
  readonly onPin: (instanceId: string) => void;
  readonly onUnpin: (instanceId: string) => void;
  readonly onExport: (instanceId: string) => void;
  readonly onDelete: (instanceId: string) => void;
};

const RunRow = ({
  item,
  now,
  isActive,
  isOpen,
  onPick,
  onPin,
  onUnpin,
  onExport,
  onDelete,
}: RunRowProps) => {
  const { instance } = item;
  const shortId = instance.id.slice(0, 8);
  const ref = `${instance.templateId}@${instance.templateVersion}`;
  const relative = formatRelativeTime(instance.updatedAt, now);
  const hasChildren = item.children.length > 0;
  const [expanded, setExpanded] = useState(true);
  const active = isActive(instance.id);

  const trigger = (
    <div>
      <button
        type="button"
        onClick={() => onPick(instance.id)}
        aria-pressed={active}
        title={`${ref} · ${shortId}`}
        style={{ paddingInlineStart: 8 + (item.depth + 1) * 6 }}
        className={cn(
          "group/leaf flex h-7 w-full items-center gap-1.5 rounded-none px-2 text-left text-xs font-normal outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-gradient-to-r from-primary/40 via-primary/20 to-transparent text-foreground hover:from-primary/45 hover:via-primary/25 hover:to-transparent"
            : "hover:bg-accent/40 hover:text-foreground",
          isOpen(instance.id) && !active && "text-foreground",
        )}
      >
        {hasChildren ? (
          <span
            role="button"
            aria-label={expanded ? "Replier" : "Déplier"}
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </span>
        ) : (
          <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
        )}
        <RunStatusGlyph status={instance.status} />
        <span className="min-w-0 flex-1 truncate">{instance.templateId}</span>
        <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
          {relative}
        </span>
      </button>
    </div>
  );

  return (
    <>
      <RunLeafMenu
        trigger={trigger}
        instanceId={instance.id}
        isPinned={item.pinned}
        onOpen={() => onPick(instance.id)}
        onPin={() => onPin(instance.id)}
        onUnpin={() => onUnpin(instance.id)}
        onExport={() => onExport(instance.id)}
        onDelete={() => onDelete(instance.id)}
      />
      {hasChildren && expanded
        ? item.children.map((child) => (
            <RunRow
              key={child.instance.id}
              item={child}
              now={now}
              isActive={isActive}
              isOpen={isOpen}
              onPick={onPick}
              onPin={onPin}
              onUnpin={onUnpin}
              onExport={onExport}
              onDelete={onDelete}
            />
          ))
        : null}
    </>
  );
};

type RunGroupProps = {
  readonly group: RunsListGroup;
  readonly hasQuery: boolean;
  readonly children: React.ReactNode;
};

const RunGroup = ({ group, hasQuery, children }: RunGroupProps) => {
  const dotClass = group.status
    ? RUN_STATUS_STYLE[group.status].dot
    : group.id === "pinned"
      ? "bg-amber-500"
      : "bg-muted-foreground/50";

  return (
    <ExplorerSection
      title={group.label}
      persistKey={`app.runs.${group.id}`}
      defaultOpen
      forceOpen={hasQuery}
      count={group.items.length}
      leading={
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", dotClass)}
        />
      }
    >
      {children}
    </ExplorerSection>
  );
};

type RunsViewProps = {
  // Mode workspace (spec runs-unified-resizable-workspace.md §6.4) : quand
  // `onPick` est fourni, cliquer un run pilote la sélection du Run Workspace au
  // lieu d'ouvrir un éditeur `run://`. Sans ces props, comportement historique
  // (vue gauche `runs.list` qui ouvre un éditeur).
  readonly selectedRunId?: string | null;
  readonly onPick?: (instanceId: string) => void;
};

const RunsView = ({ selectedRunId, onPick }: RunsViewProps = {}) => {
  const navigate = useNavigate();
  const wb = useWorkbench();
  const t = useT();
  const services = useServices();
  const editors = useEditors();
  const activeEditor = useActiveEditor();

  const pinnedIds = usePinnedIds();
  const pinRun = usePinRun();
  const unpinRun = useUnpinRun();

  const groupMode = useRunsGroupMode();
  const setGroupMode = useSetRunsGroupMode();
  const statusFilter = useRunsStatusFilter();
  const toggleStatus = useToggleRunsStatus();
  const clearStatusFilter = useRunsViewStore((s) => s.clearStatusFilter);
  const filterActive = statusFilter.size > 0;

  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const { instances, error, deleteInstance } = useInstanceList(query);

  const groups = useMemo(
    () =>
      buildRunsList({
        instances,
        pinnedIds,
        statusFilter,
        groupMode,
      }),
    [instances, pinnedIds, statusFilter, groupMode],
  );

  const activeUri = activeEditor?.uri ?? null;
  const openUris = useMemo(
    () => new Set(editors.map((e) => e.uri)),
    [editors],
  );

  const hasRunningRun = useMemo(
    () => instances.some((i) => i.status === "running"),
    [instances],
  );
  const now = useTickingNow(hasRunningRun ? 30_000 : null);

  const handleExportRun = async (instanceId: string) => {
    try {
      const { path } = await services.exportRun(instanceId);
      if (path) {
        toast.success("Run exporté en JSON", { description: path });
      }
    } catch (e) {
      toast.error("Export impossible", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const hasQuery = query.trim().length > 0;
  const totalCount = useMemo(
    () =>
      groups.reduce(
        (acc, g) => acc + (g.id === "pinned" ? 0 : g.items.length),
        0,
      ),
    [groups],
  );

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-1.5 px-3 pb-2 pt-2">
        <div className="min-w-0 flex-1">
          <SearchInput
            placeholder="Rechercher…"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
          />
        </div>

        <Menu.Root>
          <Menu.Trigger
            aria-label="Grouper par"
            title="Grouper par"
            className={iconButtonClass}
          >
            <Group className="size-4" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="end" sideOffset={4} className="z-50">
              <Menu.Popup className={menuPopupClass}>
                <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("runs.list.groupBy")}
                </div>
                <Menu.RadioGroup
                  value={groupMode}
                  onValueChange={(value) =>
                    setGroupMode(value as RunsGroupMode)
                  }
                >
                  {GROUP_MODE_OPTIONS.map((opt) => (
                    <Menu.RadioItem
                      key={opt.value}
                      value={opt.value}
                      className={menuItemClass}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <Menu.RadioItemIndicator>
                          <Check className="size-3.5" />
                        </Menu.RadioItemIndicator>
                      </span>
                      {opt.label}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>

        <Menu.Root>
          <Menu.Trigger
            aria-label="Filtrer par statut"
            title="Filtrer par statut"
            className={cn(iconButtonClass, "relative")}
          >
            <ListFilter className="size-4" />
            {filterActive ? (
              <span
                aria-hidden
                className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
              />
            ) : null}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="end" sideOffset={4} className="z-50">
              <Menu.Popup className={menuPopupClass}>
                <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("runs.list.filterByStatus")}
                </div>
                {RUNS_STATUS_ORDER.map((status) => {
                  const active =
                    statusFilter.size === 0 || statusFilter.has(status);
                  const style = RUN_STATUS_STYLE[status];
                  return (
                    <Menu.CheckboxItem
                      key={status}
                      checked={active}
                      onCheckedChange={() => toggleStatus(status)}
                      closeOnClick={false}
                      className={menuItemClass}
                      title={chipTitle(status)}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <Menu.CheckboxItemIndicator>
                          <Check className="size-3.5" />
                        </Menu.CheckboxItemIndicator>
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          style.dot,
                        )}
                      />
                      <span className="flex-1">
                        {RUN_STATUS_LABEL[status]}
                      </span>
                    </Menu.CheckboxItem>
                  );
                })}
                {filterActive ? (
                  <>
                    <div aria-hidden className="my-1 h-px bg-border" />
                    <Menu.Item
                      className={menuItemClass}
                      onClick={clearStatusFilter}
                    >
                      <span className="size-4 shrink-0" aria-hidden />
                      {t("runs.list.showAll")}
                    </Menu.Item>
                  </>
                ) : null}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            void navigate("/runs/new");
          }}
          aria-label="Nouveau run"
          title="Nouveau run"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {error ? <ErrorState variant="inline" message={error} /> : null}

      <ScrollArea className="min-h-0 flex-1 pb-2">
        {groups.length === 0 ? (
          instances.length === 0 ? (
            <EmptyState
              icon={<History />}
              title="Aucun run pour le moment"
              description="Lance-en un pour exécuter un workflow."
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigate("/runs/new");
                  }}
                >
                  <Plus className="size-3.5" />
                  Nouveau run
                </Button>
              }
            />
          ) : (
            <EmptyState
              size="sm"
              fill={false}
              description={
                hasQuery
                  ? `Aucun run pour « ${query.trim()} »`
                  : "Aucun run ne correspond aux filtres."
              }
            />
          )
        ) : (
          groups.map((group) => {
            const workspaceMode = onPick != null;
            const isActive = (id: string) =>
              workspaceMode ? selectedRunId === id : activeUri === runUriFor(id);
            const isOpen = (id: string) =>
              workspaceMode
                ? selectedRunId === id
                : openUris.has(runUriFor(id));
            const pick = (id: string) =>
              onPick ? onPick(id) : wb.openEditor(runUriFor(id), { focus: true });
            return (
              <RunGroup key={group.id} group={group} hasQuery={hasQuery}>
                {group.items.map((item) => (
                  <RunRow
                    key={`${group.id}:${item.instance.id}`}
                    item={item}
                    now={now}
                    isActive={isActive}
                    isOpen={isOpen}
                    onPick={pick}
                    onPin={(id) => pinRun(id)}
                    onUnpin={(id) => unpinRun(id)}
                    onExport={(id) => void handleExportRun(id)}
                    onDelete={(id) => void deleteInstance(id)}
                  />
                ))}
              </RunGroup>
            );
          })
        )}
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          <Cog className="size-3 shrink-0" aria-hidden />
          {t("runs.list.count", { count: totalCount })}
        </span>
      </div>
    </div>
  );
};

const chipTitle = (status: InstanceStatus): string => {
  switch (status) {
    case "running":
      return "Filtrer : en cours";
    case "awaitingHuman":
      return "Filtrer : attente humaine";
    case "completed":
      return "Filtrer : terminés";
    case "failed":
      return "Filtrer : échoués";
  }
};

export default RunsView;
