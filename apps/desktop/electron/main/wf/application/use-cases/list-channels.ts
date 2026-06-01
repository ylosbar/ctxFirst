import type { ChannelRegistry } from "../ports/outbound/channel-registry";
import type { Channel } from "../../domain/channel";

type Deps = { channels: ChannelRegistry };

export type ListChannels = () => Promise<ReadonlyArray<Channel>>;

export const makeListChannels =
  ({ channels }: Deps): ListChannels =>
  () =>
    channels.list();
