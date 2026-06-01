import type { ChannelContext } from "../../application/ports/outbound/channel-context";

type Options = {
  initial: string;
  /** Called every time `setActive` mutates the cell — used to persist. */
  onPersist?: (channelId: string) => void;
};

/**
 * In-memory cell + observer list. Hydrated by the composition root from
 * `SettingsStore.getActiveChannelId()` and persisted back via `onPersist`.
 */
export const createInMemoryChannelContext = (
  { initial, onPersist }: Options,
): ChannelContext => {
  let active = initial;
  const listeners = new Set<(channelId: string) => void>();
  return {
    getActive: () => active,
    setActive: (channelId: string) => {
      if (channelId === active) return;
      active = channelId;
      if (onPersist) onPersist(channelId);
      for (const fn of listeners) fn(channelId);
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
};
