/**
 * Port abstracting native system interactions that are not workflow-specific
 * (file pickers, OS dialogs, …). Adapters wire the actual platform calls.
 */
export interface SystemGateway {
  /**
   * Opens a native directory picker. Returns the absolute path chosen by the
   * user, or `null` if the dialog was cancelled.
   */
  pickDirectory(args?: {
    defaultPath?: string;
    title?: string;
  }): Promise<string | null>;

  /**
   * Opens a native file picker. Returns the absolute path chosen by the
   * user, or `null` if the dialog was cancelled.
   */
  pickFile(args?: {
    defaultPath?: string;
    title?: string;
    filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
  }): Promise<string | null>;

  /**
   * Opens a native file picker and reads the chosen file as UTF-8 text.
   * Single round-trip variant of `pickFile` — the renderer is sandboxed and
   * cannot read files itself, so combining pick + read here avoids exposing a
   * standalone `readTextFile` IPC.
   */
  pickAndReadTextFile(args?: {
    defaultPath?: string;
    title?: string;
    filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
  }): Promise<{ path: string; content: string } | null>;

  /**
   * Opens a native save dialog and writes `content` (UTF-8 text) to the path
   * chosen by the user. Returns the absolute path written, or `null` if the
   * dialog was cancelled.
   */
  saveTextFile(args: {
    content: string;
    defaultFileName?: string;
    title?: string;
    filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
  }): Promise<string | null>;

  /**
   * Opens an absolute http(s) URL in the user's default browser via the OS.
   * The main process is the single point that calls `shell.openExternal`.
   * Implementations should reject non-http(s) URLs.
   */
  openExternal(url: string): Promise<void>;

  /**
   * Window controls — the BrowserWindow runs frameless+transparent so the
   * renderer paints its own min/max/close buttons. These methods forward the
   * intent to the main process; `onMaximizedChange` streams the current
   * maximized state, including transitions triggered by the WM itself
   * (Super+Up, double-click on the drag region…).
   */
  window: {
    minimize(): Promise<void>;
    maximizeToggle(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizedChange(listener: (maximized: boolean) => void): () => void;
  };
}
