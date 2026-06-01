import type { ChannelContext } from "../../application/ports/outbound/channel-context";

/**
 * Standard SQL predicate applied by every scopable list query.
 * `channel_id IS NULL` keeps explicitly-globalized rows visible from any
 * channel; `channel_id = :channel` restricts everything else to the current
 * channel.
 */
export const channelScopeWhere = "(channel_id = :channel OR channel_id IS NULL)";

/** Convenience for `.all(bindChannel(channels))` — keeps the param name stable. */
export const bindChannel = (channels: ChannelContext): { channel: string } => ({
  channel: channels.getActive(),
});
