import { useCallback, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import { useT } from "../../i18n";
import { useLayoutController } from "./run-workspace-controller";
import {
  COLLAPSED_SIZE,
  DEFAULT_LAYOUT,
  type PaneNode,
  type PanePanel,
  type ZoneId,
} from "./run-workspace-layout";

// Pixels en deçà desquels un panneau est considéré replié (cf. COLLAPSED_SIZE).
const COLLAPSED_PX = 35;

type RenderZone = (zone: ZoneId) => ReactNode;

const SEPARATOR_BASE =
  "relative shrink-0 bg-border/60 transition-colors hover:bg-primary/40 data-[separator]:bg-border/60";

const collapseBtnClass =
  "inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

const headerTabClass =
  "rounded px-2 py-0.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

const TAB_STORAGE_PREFIX = "runWorkspace.tab.";

const readTab = (panelId: string, fallback: ZoneId): ZoneId => {
  try {
    const v = window.localStorage.getItem(TAB_STORAGE_PREFIX + panelId);
    return v ? (v as ZoneId) : fallback;
  } catch {
    return fallback;
  }
};

const writeTab = (panelId: string, zone: ZoneId): void => {
  try {
    window.localStorage.setItem(TAB_STORAGE_PREFIX + panelId, zone);
  } catch {
    /* storage unavailable */
  }
};

// Feuille de l'arbre : une zone (ou un groupe d'onglets) avec son en-tête et son
// bouton de repli. L'en-tête reste visible quand la zone est repliée (réduite à
// sa barre) ; replié dans un groupe horizontal, seul le chevron d'expansion est
// affiché pour tenir dans la largeur de COLLAPSED_SIZE.
const Pane = ({
  panel,
  orientation,
  renderZone,
}: {
  readonly panel: PanePanel;
  readonly orientation: "horizontal" | "vertical";
  readonly renderZone: RenderZone;
}) => {
  const ctrl = useLayoutController();
  const t = useT();
  const collapsed = ctrl.collapsed[panel.id] ?? false;
  const isTabs = panel.child.type === "tabs";
  const tabZones = panel.child.type === "tabs" ? panel.child.zones : [];
  const [active, setActive] = useState<ZoneId>(() =>
    isTabs ? readTab(panel.id, tabZones[0] ?? "timeline") : "timeline",
  );

  const selectTab = useCallback(
    (zone: ZoneId) => {
      setActive(zone);
      writeTab(panel.id, zone);
    },
    [panel.id],
  );

  if (collapsed && orientation === "horizontal") {
    return (
      <div className="flex h-full w-full flex-col items-center pt-1.5">
        <button
          type="button"
          onClick={() => ctrl.toggle(panel.id)}
          title={t("runs.workspace.expand")}
          aria-label={t("runs.workspace.expand")}
          className={collapseBtnClass}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    );
  }

  const body =
    panel.child.type === "tabs"
      ? renderZone(active)
      : panel.child.type === "zone"
        ? renderZone(panel.child.zone)
        : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border bg-muted/30 px-2">
        {isTabs ? (
          <div className="flex items-center gap-0.5">
            {tabZones.map((zone) => (
              <button
                key={zone}
                type="button"
                onClick={() => selectTab(zone)}
                aria-pressed={active === zone}
                className={cn(
                  headerTabClass,
                  active === zone
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`runs.workspace.zone.${zone}`)}
              </button>
            ))}
          </div>
        ) : (
          <span className="truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(panel.titleKey)}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => ctrl.toggle(panel.id)}
          title={collapsed ? t("runs.workspace.expand") : t("runs.workspace.collapse")}
          aria-label={collapsed ? t("runs.workspace.expand") : t("runs.workspace.collapse")}
          className={collapseBtnClass}
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>
      </div>
      {!collapsed ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{body}</div>
      ) : null}
    </div>
  );
};

// Rend un nœud `split` : un Group react-resizable-panels avec ses panneaux et
// les séparateurs (gutters) entre eux. Récursif — un panneau dont l'enfant est
// lui-même un split rend un Group imbriqué.
const SplitGroup = ({
  node,
  renderZone,
}: {
  readonly node: Extract<PaneNode, { type: "split" }>;
  readonly renderZone: RenderZone;
}) => {
  const ctrl = useLayoutController();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: node.id });
  const horizontal = node.orientation === "horizontal";

  return (
    <Group
      id={node.id}
      orientation={node.orientation}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      groupRef={(h) => ctrl.registerGroup(node.id, h)}
      className="min-h-0 min-w-0"
    >
      {node.panels.flatMap((panel, index) => {
        const els: ReactNode[] = [];
        if (index > 0) {
          els.push(
            <Separator
              key={`sep-${panel.id}`}
              className={cn(
                SEPARATOR_BASE,
                horizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
              )}
            />,
          );
        }
        els.push(
          <Panel
            key={panel.id}
            id={panel.id}
            defaultSize={panel.defaultSize}
            minSize={panel.minSize}
            collapsible={panel.collapsible}
            collapsedSize={panel.collapsible ? COLLAPSED_SIZE : undefined}
            panelRef={(h) => ctrl.registerPanel(panel.id, h)}
            onResize={
              panel.collapsible
                ? (size) =>
                    ctrl.notifyCollapsed(panel.id, size.inPixels <= COLLAPSED_PX)
                : undefined
            }
            className="min-h-0 min-w-0"
          >
            {panel.child.type === "split" ? (
              <SplitGroup node={panel.child} renderZone={renderZone} />
            ) : (
              <Pane
                panel={panel}
                orientation={node.orientation}
                renderZone={renderZone}
              />
            )}
          </Panel>,
        );
        return els;
      })}
    </Group>
  );
};

const RunWorkspaceSplit = ({ renderZone }: { readonly renderZone: RenderZone }) => {
  if (DEFAULT_LAYOUT.type !== "split") return null;
  return <SplitGroup node={DEFAULT_LAYOUT} renderZone={renderZone} />;
};

export default RunWorkspaceSplit;
