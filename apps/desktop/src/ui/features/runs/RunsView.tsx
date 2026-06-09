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
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import VirtualList from "@/components/ui/virtual-list";
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
  useCollapsedRunGroupIds,
  useCollapsedRunIds,
  useRunsGroupMode,
  useRunsStatusFilter,
  useRunsViewStore,
  useSetRunsGroupMode,
  useToggleRunCollapsed,
  useToggleRunGroupCollapsed,
  useToggleRunsStatus,
} from "../../stores/runs-view-store";
import {
  useActiveEditor,
  useEditors,
  useWorkbench,
} from "../../workbench/WorkbenchProvider";
import {
  buildRunsList,
  flattenRunsList,
  RUNS_STATUS_ORDER,
  type RunsGroupMode,
  type RunsListGroup,
  type RunsListItem,
  type RunListRow,
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
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly now: number;
  readonly active: boolean;
  readonly open: boolean;
  readonly onPick: (instanceId: string) => void;
  readonly onPin: (instanceId: string) => void;
  readonly onUnpin: (instanceId: string) => void;
  readonly onExport: (instanceId: string) => void;
  readonly onDelete: (instanceId: string) => void;
  readonly onToggleExpand: (instanceId: string) => void;
};

/**
 * A single, non-recursive run row. Memoized so a re-render of the list (30 s
 * tick aside, store/search changes) skips rows whose props are unchanged —
 * possible only because expansion/selection are now booleans resolved by the
 * container (was per-row local state + per-render callbacks, perf P3). The
 * subtree is flattened by {@link flattenRunsList}, not rendered here.
 */
const RunRow = memo(
  ({
    item,
    hasChildren,
    expanded,
    now,
    active,
    open,
    onPick,
    onPin,
    onUnpin,
    onExport,
    onDelete,
    onToggleExpand,
  }: RunRowProps) => {
    const { instance } = item;
    const shortId = instance.id.slice(0, 8);
    const ref = `${instance.templateId}@${instance.templateVersion}`;
    const relative = formatRelativeTime(instance.updatedAt, now);

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
            open && !active && "text-foreground",
          )}
        >
          {hasChildren ? (
            <span
              role="button"
              aria-label={expanded ? "Replier" : "Déplier"}
              aria-expanded={expanded}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(instance.id);
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
    );
  },
);
RunRow.displayName = "RunRow";

type RunGroupHeaderProps = {
  readonly group: RunsListGroup;
  readonly collapsed: boolean;
  readonly onToggle: (groupId: string) => void;
};

/**
 * Flat group header row — the virtualized counterpart of the former
 * `ExplorerSection` wrapper (§6.2). Sticky positioning is dropped in v1; the
 * chevron/leading dot/count visuals are preserved.
 */
const RunGroupHeader = memo(
  ({ group, collapsed, onToggle }: RunGroupHeaderProps) => {
    const dotClass = group.status
      ? RUN_STATUS_STYLE[group.status].dot
      : group.id === "pinned"
        ? "bg-amber-500"
        : "bg-muted-foreground/50";

    return (
      <div className="flex h-[26px] items-stretch border-b border-border bg-muted/50 backdrop-blur-sm hover:bg-muted/80">
        <button
          type="button"
          onClick={() => onToggle(group.id)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-1 pl-1.5 pr-1 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              !collapsed && "rotate-90",
            )}
          />
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", dotClass)}
          />
          <span className="truncate">{group.label}</span>
          <span className="ml-1 shrink-0 rounded-full bg-foreground/10 px-1.5 py-px text-2xs font-medium tabular-nums text-muted-foreground">
            {group.items.length}
          </span>
        </button>
      </div>
    );
  },
);
RunGroupHeader.displayName = "RunGroupHeader";

const ROW_ESTIMATE_PX = 28;
const HEADER_ESTIMATE_PX = 26;

const runRowKey = (row: RunListRow): string =>
  row.kind === "groupHeader"
    ? `group:${row.group.id}`
    : `${row.groupId}:${row.node.instance.id}`;

const estimateRunRow = (row: RunListRow): number =>
  row.kind === "groupHeader" ? HEADER_ESTIMATE_PX : ROW_ESTIMATE_PX;

/** Module-stable so it doesn't churn the virtualizer's sticky index set. */
const isStickyRunRow = (row: RunListRow): boolean => row.kind === "groupHeader";

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

  const collapsedGroupIds = useCollapsedRunGroupIds();
  const collapsedRunIds = useCollapsedRunIds();
  const toggleGroupCollapsed = useToggleRunGroupCollapsed();
  const toggleRunCollapsed = useToggleRunCollapsed();

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

  const hasQuery = query.trim().length > 0;

  const rows = useMemo(
    () =>
      flattenRunsList({
        groups,
        collapsedGroupIds,
        collapsedRunIds,
        hasQuery,
      }),
    [groups, collapsedGroupIds, collapsedRunIds, hasQuery],
  );

  // Selection/openness are passed to each row as booleans (not predicates) so
  // memoized rows bail out; the workspace-vs-editor switch lives here.
  const workspaceMode = onPick != null;
  const isActiveId = useCallback(
    (id: string) =>
      workspaceMode ? selectedRunId === id : activeUri === runUriFor(id),
    [workspaceMode, selectedRunId, activeUri],
  );
  const isOpenId = useCallback(
    (id: string) =>
      workspaceMode ? selectedRunId === id : openUris.has(runUriFor(id)),
    [workspaceMode, selectedRunId, openUris],
  );

  const handlePick = useCallback(
    (id: string) =>
      onPick ? onPick(id) : wb.openEditor(runUriFor(id), { focus: true }),
    [onPick, wb],
  );
  const handlePin = useCallback((id: string) => pinRun(id), [pinRun]);
  const handleUnpin = useCallback((id: string) => unpinRun(id), [unpinRun]);
  const handleDelete = useCallback(
    (id: string) => void deleteInstance(id),
    [deleteInstance],
  );
  const handleExportRun = useCallback(
    async (id: string) => {
      try {
        const { path } = await services.exportRun(id);
        if (path) {
          toast.success("Run exporté en JSON", { description: path });
        }
      } catch (e) {
        toast.error("Export impossible", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [services],
  );
  const handleExport = useCallback(
    (id: string) => void handleExportRun(id),
    [handleExportRun],
  );

  const renderRow = useCallback(
    (row: RunListRow) => {
      if (row.kind === "groupHeader") {
        return (
          <RunGroupHeader
            group={row.group}
            collapsed={row.collapsed}
            onToggle={toggleGroupCollapsed}
          />
        );
      }
      const id = row.node.instance.id;
      return (
        <RunRow
          item={row.node}
          hasChildren={row.hasChildren}
          expanded={row.expanded}
          now={now}
          active={isActiveId(id)}
          open={isOpenId(id)}
          onPick={handlePick}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onExport={handleExport}
          onDelete={handleDelete}
          onToggleExpand={toggleRunCollapsed}
        />
      );
    },
    [
      now,
      isActiveId,
      isOpenId,
      handlePick,
      handlePin,
      handleUnpin,
      handleExport,
      handleDelete,
      toggleGroupCollapsed,
      toggleRunCollapsed,
    ],
  );

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

      {rows.length === 0 ? (
        <div className="min-h-0 flex-1">
          {instances.length === 0 ? (
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
          )}
        </div>
      ) : (
        <VirtualList
          className="min-h-0 flex-1 pb-2"
          ariaLabel={t("runs.list.ariaLabel")}
          items={rows}
          getKey={runRowKey}
          estimateSize={estimateRunRow}
          renderItem={renderRow}
          isSticky={isStickyRunRow}
        />
      )}

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
