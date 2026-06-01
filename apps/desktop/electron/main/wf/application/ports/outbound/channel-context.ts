/**
 * Runtime-mutable holder of the currently-active channel.
 *
 * The active channel rarely changes (driven by an explicit UI action), but is
 * read on virtually every database list. Threading it through every use-case
 * signature would multiply the points of modification; instead, scopable
 * adapters take a `ChannelContext` dep and pull the current id on each read.
 *
 * The port is *not* a singleton — it is instantiated by the composition root
 * and injected like any other outbound port, so tests can build an isolated
 * context per case.
 */
export type ChannelContext = {
  /** Currently-active channel id. Never null — falls back to a default seed. */
  getActive(): string;
  /**
   * Switches the active channel. Triggers any registered `subscribe` listeners
   * synchronously (used by the IPC bridge to broadcast `channelChanged` to
   * the renderer).
   */
  setActive(channelId: string): void;
  /**
   * Subscribe to channel switches. Returns an unsubscribe function. Listeners
   * are invoked synchronously from inside `setActive`.
   */
  subscribe(fn: (channelId: string) => void): () => void;
};
