import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * One-shot "expand all / collapse all" command for the explorer tree.
 *
 * Each folder persists its own open state (cf. useCollapsibleState), so there
 * is no single source of truth to flip. Instead we broadcast a bulk signal:
 * the `nonce` changes on every action so a folder's effect re-fires even when
 * `open` is unchanged. Not persisted — resets to collapsed on reload.
 */
export type ExplorerBulkSignal = {
  readonly open: boolean;
  readonly nonce: number;
};

export type ExplorerViewState = {
  readonly showSubtitles: boolean;
  readonly toggleSubtitles: () => void;
  readonly setShowSubtitles: (value: boolean) => void;
  readonly allExpanded: boolean;
  readonly bulk: ExplorerBulkSignal | null;
  readonly toggleExpandAll: () => void;
};

export const useExplorerViewStore = create<ExplorerViewState>()(
  persist(
    (set, get) => ({
      showSubtitles: true,
      toggleSubtitles: () => set({ showSubtitles: !get().showSubtitles }),
      setShowSubtitles: (value) => set({ showSubtitles: value }),
      allExpanded: false,
      bulk: null,
      toggleExpandAll: () =>
        set((s) => {
          const open = !s.allExpanded;
          return {
            allExpanded: open,
            bulk: { open, nonce: (s.bulk?.nonce ?? 0) + 1 },
          };
        }),
    }),
    {
      name: "ui.explorer.view",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ showSubtitles: s.showSubtitles }),
    },
  ),
);

export const useShowSubtitles = (): boolean =>
  useExplorerViewStore((s) => s.showSubtitles);

export const useToggleSubtitles = (): (() => void) =>
  useExplorerViewStore((s) => s.toggleSubtitles);

export const useAllExpanded = (): boolean =>
  useExplorerViewStore((s) => s.allExpanded);

export const useToggleExpandAll = (): (() => void) =>
  useExplorerViewStore((s) => s.toggleExpandAll);

export const useExplorerBulk = (): ExplorerBulkSignal | null =>
  useExplorerViewStore((s) => s.bulk);
