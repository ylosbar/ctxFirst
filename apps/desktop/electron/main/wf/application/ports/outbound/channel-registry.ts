import type {
  Channel,
  ChannelDraft,
  ChannelIconImageMime,
} from "../../../domain/channel";

/**
 * Persistence draft accepted by `save`. The image fields are kept separate
 * from `ChannelDraft.iconImage` (the upload input) because the use-case
 * writes the file to disk first and only then forwards the resulting
 * `path`/`mime` here. `undefined` on either column means "no-op" (kept by
 * the adapter via a sentinel flag); `null` means "explicit clear".
 */
export type ChannelPersistDraft = Omit<ChannelDraft, "iconImage"> & {
  iconImagePath?: string | null;
  iconImageMime?: ChannelIconImageMime | null;
};

/**
 * CRUD port for the `channels` table. Pure persistence — invariants
 * (cannot delete the default seed, slug shape) live in the use-cases.
 */
export type ChannelRegistry = {
  list(): Promise<ReadonlyArray<Channel>>;
  get(id: string): Promise<Channel | null>;
  save(channel: ChannelPersistDraft): Promise<void>;
  remove(id: string): Promise<void>;
};
