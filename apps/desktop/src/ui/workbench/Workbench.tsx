import { useMemo, useState, type ReactNode } from "react";
import CommandPalette from "../components/command-palette/CommandPalette";
import ActivityBar from "./ActivityBar";
import WorkbenchDock from "./WorkbenchDock";
import WorkbenchProvider from "./WorkbenchProvider";
import WindowTitleBar from "./WindowTitleBar";
import WorkbenchRouterSync from "./WorkbenchRouterSync";
import WorkbenchShortcuts from "./WorkbenchShortcuts";
import SplashScreen from "./SplashScreen";
import { workbenchRegistry } from "./registry";

// Spec workbench-unified-dockview.md §1 / PR 2c : suppression du
// `GridviewReact` extérieur et de ses 4 slot-hosts. Le workbench se réduit à
// l'ActivityBar + un unique `WorkbenchDock` (DockviewReact) qui héberge à la
// fois les éditeurs et les vues (chat, explorer, plugins, terminal, etc.) en
// panels de premier rang. DnD inter-bordures activé nativement par dockview.
const WorkbenchLayout = () => {
  const [windowMaximized, setWindowMaximized] = useState(false);
  return (
    <div
      className="app-rounded-surface flex h-screen flex-col bg-background text-foreground"
      data-maximized={windowMaximized ? "true" : "false"}
    >
      <WindowTitleBar onMaximizedChange={setWindowMaximized} />
      <div className="flex min-h-0 flex-1 flex-row">
        <ActivityBar />
        <div className="min-h-0 min-w-0 flex-1">
          <WorkbenchDock />
        </div>
      </div>
      <SplashScreen />
    </div>
  );
};

const FeatureHostProviders = ({ children }: { children: ReactNode }) => {
  const hosts = useMemo(() => workbenchRegistry.hosts(), []);
  return hosts.reduceRight<ReactNode>(
    (acc, host) =>
      host.Provider ? <host.Provider>{acc}</host.Provider> : acc,
    children,
  );
};

const FeatureOverlays = () => {
  const hosts = useMemo(() => workbenchRegistry.hosts(), []);
  return (
    <>
      {hosts.map((host) =>
        host.Overlay ? <host.Overlay key={host.id} /> : null,
      )}
    </>
  );
};

const Workbench = () => {
  return (
    <WorkbenchProvider>
      <FeatureHostProviders>
        <WorkbenchRouterSync />
        <WorkbenchShortcuts />
        <WorkbenchLayout />
        <FeatureOverlays />
        <CommandPalette />
      </FeatureHostProviders>
    </WorkbenchProvider>
  );
};

export default Workbench;
