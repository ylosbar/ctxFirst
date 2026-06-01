import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview-react";
import { workbenchRegistry } from "./registry";
import {
  WORKBENCH_TAB_COMPONENT,
  workbenchTabComponentForType,
  useWorkbench,
  useWorkbenchStore,
  useActiveEditor,
  type EditorPanelParams,
} from "./store";
import EditorTabRenderer from "./EditorTabRenderer";
import ViewTabRenderer from "./ViewTabRenderer";
import Watermark from "./Watermark";
import { usePanelShadows } from "../stores/appearance-store";
import { useDockReconciler } from "./dock-reconciler";
import {
  VIEW_PANEL_COMPONENT,
  VIEW_TAB_COMPONENT,
  WATERMARK_PANEL_COMPONENT,
  WATERMARK_TAB_COMPONENT,
  type ViewPanelParams,
} from "./dock-panels";
import type { ViewRenderProps } from "./types";
import { useT } from "@/ui/i18n";

const EditorPanelHost = (props: IDockviewPanelProps<EditorPanelParams>) => {
  const t = useT();
  const api = useWorkbench();
  const { uri } = props.params;
  const type = workbenchRegistry.editorTypeFor(uri);
  if (!type) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        {t("workbench.dock.noEditorRegistered", { uri })}
      </div>
    );
  }
  return <>{type.render({ uri, api })}</>;
};

const ViewPanelHost = (props: IDockviewPanelProps<ViewPanelParams>) => {
  const api = useWorkbench();
  const activeEditor = useActiveEditor();
  const view = workbenchRegistry.getView(props.params.viewId);
  if (!view) return null;
  const renderProps: ViewRenderProps = { api, activeEditor };
  return <>{view.render(renderProps)}</>;
};

// Hosts the watermark inside its (header-hidden, locked) center group when no
// editor is open. Ignores panel props — the Watermark reads from hooks.
const WatermarkPanelHost = () => <Watermark />;

// Empty tab for the watermark group — its header is hidden anyway, but a no-op
// renderer keeps the default editor tab (which reads uri/typeId) off it.
const WatermarkTabRenderer = () => null;

const WorkbenchDock = () => {
  // Re-read editor types whenever the registry bumps — plugins boot
  // asynchronously and register their editor types after WorkbenchDock has
  // mounted, so a one-shot useMemo snapshot would miss them and Dockview
  // would fail to find the panel component.
  const registryVersion = useSyncExternalStore(
    workbenchRegistry.subscribe,
    workbenchRegistry.getVersion,
    () => 0,
  );

  const components = useMemo(() => {
    type PanelComponent =
      | typeof EditorPanelHost
      | typeof ViewPanelHost
      | typeof WatermarkPanelHost;
    const map: Record<string, PanelComponent> = {
      [VIEW_PANEL_COMPONENT]: ViewPanelHost,
      [WATERMARK_PANEL_COMPONENT]: WatermarkPanelHost,
    };
    for (const t of workbenchRegistry.editorTypes()) {
      map[t.id] = EditorPanelHost;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryVersion]);

  const tabComponents = useMemo(() => {
    type TabComponent = React.FunctionComponent<IDockviewPanelHeaderProps>;
    const map: Record<string, TabComponent> = {
      [WORKBENCH_TAB_COMPONENT]: EditorTabRenderer,
      [VIEW_TAB_COMPONENT]: ViewTabRenderer,
      [WATERMARK_TAB_COMPONENT]: WatermarkTabRenderer,
    };
    for (const t of workbenchRegistry.editorTypes()) {
      if (t.tab) {
        map[workbenchTabComponentForType(t.id)] =
          t.tab as unknown as TabComponent;
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryVersion]);

  useDockReconciler();

  const handleReady = useCallback((event: DockviewReadyEvent) => {
    useWorkbenchStore.getState().setDockviewApi(event.api);
  }, []);

  const panelShadows = usePanelShadows();

  return (
    <div className="relative h-full w-full">
      <DockviewReact
        className="dockview-theme-ctxfirst h-full w-full"
        components={components}
        tabComponents={tabComponents}
        watermarkComponent={Watermark}
        defaultTabComponent={EditorTabRenderer}
        onReady={handleReady}
      />
      {/* Elevation shadows cast by the (higher) sidebars onto the editor.
          Rendered on the editor's own edges because each dockview panel clips
          overflow, so a box-shadow on a sidebar can't bleed across the sash.
          pointer-events-none keeps the editor fully interactive. Toggleable
          via Settings → Appearance (appearance-store `panelShadows`). */}
      {panelShadows && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-black/8 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-4 bg-gradient-to-l from-black/8 to-transparent"
          />
        </>
      )}
    </div>
  );
};

export default WorkbenchDock;
