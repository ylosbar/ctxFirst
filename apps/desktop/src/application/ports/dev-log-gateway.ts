/**
 * Port abstracting the streaming of dev-log lines (main stdout/stderr + console
 * renderer) into the workbench bottom-dock terminal view. The adapter wraps the
 * IPC `devlog:*` channels exposed by the preload.
 */
import type { DevLogLine } from "@shared/dev-log";

export type { DevLogLine } from "@shared/dev-log";

export interface DevLogGateway {
  /**
   * Snapshot of the ring buffer kept by the main process — used at mount to
   * pre-populate the terminal scrollback with whatever was captured before the
   * view existed.
   */
  getBuffer(): Promise<ReadonlyArray<DevLogLine>>;

  /**
   * Subscribes to the stream of newly-captured lines. Returns an unsubscribe
   * function to call on unmount.
   */
  subscribe(onLine: (line: DevLogLine) => void): () => void;
}
