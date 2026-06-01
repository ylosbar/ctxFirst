import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { InstanceSummaryView } from "../../domain/workflow/types";

export type GateNotification = {
  readonly instanceId: string;
  readonly at: number;
};

type GateListener = (notif: GateNotification) => void;

const gateListeners = new Set<GateListener>();

export const onGateNotification = (listener: GateListener): (() => void) => {
  gateListeners.add(listener);
  return () => {
    gateListeners.delete(listener);
  };
};

export const emitGateNotification = (notif: GateNotification): void => {
  for (const fn of gateListeners) fn(notif);
};

export type InstancesById = ReadonlyMap<string, InstanceSummaryView>;

export type RunsState = {
  readonly instancesById: InstancesById;
  readonly pinnedIds: ReadonlySet<string>;
  readonly activeInstanceId: string | null;
  readonly setInstances: (rows: ReadonlyArray<InstanceSummaryView>) => void;
  readonly pinRun: (id: string) => void;
  readonly unpinRun: (id: string) => void;
  readonly notifyActiveInstance: (id: string | null) => void;
};

const STORAGE_KEY = "ctxfirst:runs:pinned:v1";

export const useRunsStore = create<RunsState>()(
  persist(
    (set) => ({
      instancesById: new Map(),
      pinnedIds: new Set<string>(),
      activeInstanceId: null,
      setInstances: (rows) =>
        set({ instancesById: new Map(rows.map((r) => [r.id, r])) }),
      pinRun: (id) =>
        set((s) => {
          if (s.pinnedIds.has(id)) return s;
          const next = new Set(s.pinnedIds);
          next.add(id);
          return { pinnedIds: next };
        }),
      unpinRun: (id) =>
        set((s) => {
          if (!s.pinnedIds.has(id)) return s;
          const next = new Set(s.pinnedIds);
          next.delete(id);
          return { pinnedIds: next };
        }),
      notifyActiveInstance: (activeInstanceId) => set({ activeInstanceId }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ pinned: [...s.pinnedIds] }),
      merge: (persisted, current) => {
        const arr = (persisted as { pinned?: unknown } | undefined)?.pinned;
        const pinnedIds = Array.isArray(arr)
          ? new Set(arr.filter((v): v is string => typeof v === "string"))
          : current.pinnedIds;
        return { ...current, pinnedIds };
      },
    },
  ),
);

export const useInstancesById = (): InstancesById =>
  useRunsStore((s) => s.instancesById);

export const usePinnedIds = (): ReadonlySet<string> =>
  useRunsStore((s) => s.pinnedIds);

export const useActiveInstanceId = (): string | null =>
  useRunsStore((s) => s.activeInstanceId);

export const usePinRun = (): ((id: string) => void) =>
  useRunsStore((s) => s.pinRun);

export const useUnpinRun = (): ((id: string) => void) =>
  useRunsStore((s) => s.unpinRun);

export const useNotifyActiveInstance = (): ((id: string | null) => void) =>
  useRunsStore((s) => s.notifyActiveInstance);
