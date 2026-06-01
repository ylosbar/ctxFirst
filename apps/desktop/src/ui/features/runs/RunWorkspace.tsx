import { useCallback, type ReactNode } from "react";
import { Columns3, RotateCcw } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import type { EditorUri } from "../../workbench/types";
import { useRegisterRunPanel } from "../../stores/run-panel-store";
import { RunPanelContext } from "./run-panel-context";
import { useT } from "../../i18n";
import { menuItemClass, menuPopupClass } from "../explorer/menus/menu-styles";
import { parseRunUri } from "./run-uri";
import useRunPanelData from "./useRunPanelData";
import RunWorkspaceSplit from "./RunWorkspaceSplit";
import {
  LayoutProvider,
  useRunWorkspaceController,
} from "./run-workspace-controller";
import { collapsiblePanels, type ZoneId } from "./run-workspace-layout";
import RunTimelineView from "./RunTimelineView";
import RunGraphPanel from "./RunGraphPanel";
import RunIterationsView from "./RunIterationsView";
import RunArtifactView from "./RunArtifactView";
import RunStatsView from "./RunStatsView";

type Props = {
  readonly uri: EditorUri;
};

const iconButtonClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent data-[popup-open]:text-foreground";

const PANELS = collapsiblePanels();

const RunWorkspace = ({ uri }: Props) => {
  const parsed = parseRunUri(uri);
  const t = useT();

  // Le run affiché vient de l'URI (`run://<id>?step=`) : le listing n'est pas
  // embarqué dans le workspace, il reste la vue gauche `runs.list` qui ouvre cet
  // éditeur. Chaque run a donc son propre onglet, identifié par son URI.
  const { contextValue } = useRunPanelData(
    parsed?.instanceId ?? "",
    parsed?.step ?? null,
  );

  // Publie le handle pour getChatContext (contributions.ts) et les éventuels
  // lecteurs `useActiveRunPanel`.
  useRegisterRunPanel(uri, contextValue);

  const controller = useRunWorkspaceController();

  const renderZone = useCallback((zone: ZoneId): ReactNode => {
    switch (zone) {
      case "timeline":
        return <RunTimelineView />;
      case "graph":
        return <RunGraphPanel />;
      case "iterations":
        return <RunIterationsView />;
      case "artifact":
        return <RunArtifactView />;
      case "stats":
        return <RunStatsView />;
    }
  }, []);

  if (!parsed) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("runs.workspace.invalidUri")} {uri}
      </div>
    );
  }

  return (
    <RunPanelContext.Provider value={contextValue}>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-end gap-1 border-b border-border bg-muted/20 px-2">
          <Menu.Root>
            <Menu.Trigger
              aria-label={t("runs.workspace.zones")}
              title={t("runs.workspace.zones")}
              className={iconButtonClass}
            >
              <Columns3 className="size-4" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner align="end" sideOffset={4} className="z-50">
                <Menu.Popup className={menuPopupClass}>
                  <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("runs.workspace.zones")}
                  </div>
                  {PANELS.map((panel) => (
                    <Menu.CheckboxItem
                      key={panel.panelId}
                      checked={!(controller.collapsed[panel.panelId] ?? false)}
                      onCheckedChange={() => controller.toggle(panel.panelId)}
                      closeOnClick={false}
                      className={menuItemClass}
                    >
                      <span className="flex-1">{t(panel.titleKey)}</span>
                    </Menu.CheckboxItem>
                  ))}
                  <div aria-hidden className="my-1 h-px bg-border" />
                  <Menu.Item className={menuItemClass} onClick={controller.reset}>
                    <RotateCcw className="size-3.5 shrink-0" aria-hidden />
                    <span className="flex-1">{t("runs.workspace.reset")}</span>
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          <LayoutProvider value={controller}>
            <RunWorkspaceSplit renderZone={renderZone} />
          </LayoutProvider>
        </div>
      </div>
    </RunPanelContext.Provider>
  );
};

export default RunWorkspace;
