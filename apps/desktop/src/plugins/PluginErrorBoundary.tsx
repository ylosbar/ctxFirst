/**
 * Exception to the project-wide "arrow-function const + default export" rule
 * (cf. CLAUDE.md § "React component style"): React 18 does not expose a
 * functional API for error boundaries — `componentDidCatch` /
 * `getDerivedStateFromError` are only available on class components. The
 * boundary is therefore implemented as a `class`. When React ships a
 * functional error-boundary primitive, this file should be migrated to the
 * canonical arrow-function form.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { i18n } from "@/ui/i18n";

type Props = {
  readonly pluginId: string;
  readonly fallbackTitle?: string;
  readonly children: ReactNode;
};

type State = {
  readonly error: Error | null;
};

/**
 * Catches render-time errors thrown by a renderer plugin's UI. The boundary
 * is per-plugin so one misbehaving plugin cannot take down the workbench —
 * its sidebar view simply displays a fallback message while the rest of the
 * app keeps running.
 */
class PluginErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[plugin:${this.props.pluginId}] render crashed: ${error.stack ?? error.message}`,
      info,
    );
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full min-w-0 flex-col gap-2 p-4 text-xs">
          <p className="text-sm font-medium text-destructive">
            {i18n.t("plugins.errorBoundary.title", {
              name: this.props.fallbackTitle ?? this.props.pluginId,
            })}
          </p>
          <p className="text-muted-foreground">
            {this.state.error.message}
          </p>
          <p className="text-muted-foreground">
            {i18n.t("plugins.errorBoundary.hint")}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default PluginErrorBoundary;
