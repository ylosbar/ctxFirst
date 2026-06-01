import type { ChannelContext } from "../../application/ports/outbound/channel-context";
import { DEFAULT_CHANNEL_ID } from "../../domain/channel";

export type FakeChannelContext = ChannelContext & {
  reset(): void;
};

export const createFakeChannelContext = (
  initial: string = DEFAULT_CHANNEL_ID,
): FakeChannelContext => {
  let active = initial;
  const listeners = new Set<(id: string) => void>();

  return {
    getActive() {
      return active;
    },
    setActive(channelId) {
      active = channelId;
      for (const fn of [...listeners]) fn(channelId);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset() {
      active = initial;
      listeners.clear();
    },
  };
};
