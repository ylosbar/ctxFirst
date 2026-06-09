import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { InstanceStatus } from "../../domain/workflow/types";
import type { RunsGroupMode } from "../features/runs/build-runs-list";

const VALID_GROUP_MODES: ReadonlyArray<RunsGroupMode> = [
  "status",
  "template",
  "none",
];

const VALID_STATUSES: ReadonlyArray<InstanceStatus> = [
  "running",
  "awaitingHuman",
  "completed",
  "failed",
];

export type RunsViewState = {
  readonly groupMode: RunsGroupMode;
  readonly statusFilter: ReadonlySet<InstanceStatus>;
  /**
   * Group headers the user collapsed, by group id. Lifted out of the row tree
   * so the flat list (`flattenRunsList`) knows the visible window before render
   * — a prerequisite for virtualization. Persisted, like the legacy
   * per-section `ExplorerSection` collapse state it replaces.
   */
  readonly collapsedGroupIds: ReadonlySet<string>;
  /**
   * Run rows whose `template.invoke` children the user collapsed, by instance
   * id. Session-scoped (not persisted), mirroring the old per-row local
   * `expanded` state that defaulted to open on mount.
   */
  readonly collapsedRunIds: ReadonlySet<string>;
  readonly setGroupMode: (mode: RunsGroupMode) => void;
  readonly toggleStatus: (status: InstanceStatus) => void;
  readonly clearStatusFilter: () => void;
  readonly toggleGroupCollapsed: (groupId: string) => void;
  readonly toggleRunCollapsed: (instanceId: string) => void;
};

type Persisted = {
  readonly groupMode?: unknown;
  readonly statusFilter?: unknown;
  readonly collapsedGroupIds?: unknown;
};

const toggleInSet = <T>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

export const useRunsViewStore = create<RunsViewState>()(
  persist(
    (set) => ({
      groupMode: "status",
      statusFilter: new Set<InstanceStatus>(),
      collapsedGroupIds: new Set<string>(),
      collapsedRunIds: new Set<string>(),
      setGroupMode: (mode) => set({ groupMode: mode }),
      toggleGroupCollapsed: (groupId) =>
        set((s) => ({
          collapsedGroupIds: toggleInSet(s.collapsedGroupIds, groupId),
        })),
      toggleRunCollapsed: (instanceId) =>
        set((s) => ({
          collapsedRunIds: toggleInSet(s.collapsedRunIds, instanceId),
        })),
      toggleStatus: (status) =>
        set((s) => {
          // Canonical "all visible" state = empty set. Clicking a chip from
          // there means "uncheck this one" → switch to explicit list of the
          // three others. Re-checking the last missing status folds back to ∅.
          if (s.statusFilter.size === 0) {
            const next = new Set<InstanceStatus>(VALID_STATUSES);
            next.delete(status);
            return { statusFilter: next };
          }
          const next = new Set(s.statusFilter);
          if (next.has(status)) {
            next.delete(status);
          } else {
            next.add(status);
            if (next.size === VALID_STATUSES.length) {
              return { statusFilter: new Set() };
            }
          }
          return { statusFilter: next };
        }),
      clearStatusFilter: () => set({ statusFilter: new Set() }),
    }),
    {
      name: "ui.runs.view",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        groupMode: s.groupMode,
        statusFilter: [...s.statusFilter],
        collapsedGroupIds: [...s.collapsedGroupIds],
      }),
      merge: (persisted, current) => {
        const p = persisted as Persisted | undefined;
        const groupMode =
          typeof p?.groupMode === "string" &&
          (VALID_GROUP_MODES as ReadonlyArray<string>).includes(p.groupMode)
            ? (p.groupMode as RunsGroupMode)
            : current.groupMode;
        const arr = Array.isArray(p?.statusFilter) ? p.statusFilter : [];
        const statusFilter = new Set<InstanceStatus>(
          arr.filter((v): v is InstanceStatus =>
            typeof v === "string" &&
            (VALID_STATUSES as ReadonlyArray<string>).includes(v),
          ),
        );
        const groupIds = Array.isArray(p?.collapsedGroupIds)
          ? p.collapsedGroupIds
          : [];
        const collapsedGroupIds = new Set<string>(
          groupIds.filter((v): v is string => typeof v === "string"),
        );
        return { ...current, groupMode, statusFilter, collapsedGroupIds };
      },
    },
  ),
);

export const useRunsGroupMode = (): RunsGroupMode =>
  useRunsViewStore((s) => s.groupMode);

export const useSetRunsGroupMode = (): ((mode: RunsGroupMode) => void) =>
  useRunsViewStore((s) => s.setGroupMode);

export const useRunsStatusFilter = (): ReadonlySet<InstanceStatus> =>
  useRunsViewStore((s) => s.statusFilter);

export const useToggleRunsStatus = (): ((status: InstanceStatus) => void) =>
  useRunsViewStore((s) => s.toggleStatus);

export const useCollapsedRunGroupIds = (): ReadonlySet<string> =>
  useRunsViewStore((s) => s.collapsedGroupIds);

export const useCollapsedRunIds = (): ReadonlySet<string> =>
  useRunsViewStore((s) => s.collapsedRunIds);

export const useToggleRunGroupCollapsed = (): ((groupId: string) => void) =>
  useRunsViewStore((s) => s.toggleGroupCollapsed);

export const useToggleRunCollapsed = (): ((instanceId: string) => void) =>
  useRunsViewStore((s) => s.toggleRunCollapsed);
