import type { ChannelContext } from "../ports/outbound/channel-context";
import type { ChannelIconStore } from "../ports/outbound/channel-icon-store";
import type { ChannelRegistry } from "../ports/outbound/channel-registry";
import { DEFAULT_CHANNEL_ID } from "../../domain/channel";

type Deps = {
  channels: ChannelRegistry;
  channelContext: ChannelContext;
  channelIcons: ChannelIconStore;
};

export type DeleteChannel = (id: string) => Promise<void>;

export const makeDeleteChannel =
  ({ channels, channelContext, channelIcons }: Deps): DeleteChannel =>
  async (id: string) => {
    if (id === DEFAULT_CHANNEL_ID) {
      throw new Error(`cannot delete the default channel "${id}"`);
    }
    const existing = await channels.get(id);
    await channels.remove(id);
    if (existing?.iconImagePath) {
      await channelIcons.remove(existing.iconImagePath);
    }
    // If the deleted channel was active, fall back to the default — the
    // ON DELETE SET NULL on each scopable table already orphans its rows to
    // the "global" pool, but the active context still has to land somewhere.
    if (channelContext.getActive() === id) {
      channelContext.setActive(DEFAULT_CHANNEL_ID);
    }
  };
