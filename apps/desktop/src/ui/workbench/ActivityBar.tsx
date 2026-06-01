import { useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import NewResourceMenu from "../features/explorer/menus/NewResourceMenu";
import ChannelActivityButton from "../channels/ChannelActivityButton";
import ThemeToggle from "../components/ThemeToggle";
import { workbenchRegistry } from "./registry";
import { useActiveActivity, useWorkbench } from "./WorkbenchProvider";
import type { ActivityContribution } from "./types";

const ActivityButton = ({
  activity,
  isActive,
  onActivate,
}: {
  activity: ActivityContribution;
  isActive: boolean;
  onActivate: () => void;
}) => {
  const Icon = activity.icon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={activity.title}
            aria-pressed={isActive}
            onClick={onActivate}
            className={cn(
              "rounded-[10px] [&_svg]:size-6",
              isActive
                ? "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            <Icon />
          </Button>
        }
      />
      <TooltipContent side="right">{activity.title}</TooltipContent>
    </Tooltip>
  );
};

const ActivityBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const wb = useWorkbench();
  const activeActivity = useActiveActivity();
  // Re-read activities whenever the registry version bumps — keeps late
  // contributions (renderer plugins booted asynchronously) visible without
  // a manual refresh.
  const registryVersion = useSyncExternalStore(
    workbenchRegistry.subscribe,
    workbenchRegistry.getVersion,
    () => 0,
  );

  const { topActivities, bottomActivities } = useMemo(() => {
    const top: ActivityContribution[] = [];
    const bottom: ActivityContribution[] = [];
    for (const a of workbenchRegistry.activities()) {
      if (a.placement === "bottom") bottom.push(a);
      else top.push(a);
    }
    return { topActivities: top, bottomActivities: bottom };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryVersion]);

  const handleActivate = (activity: ActivityContribution) => {
    if (activity.onActivate) {
      activity.onActivate();
      return;
    }
    if (activity.route) {
      // Re-clicking an activity icon shouldn't strip a deeper sub-route
      // (e.g. /settings/plugins → /settings); preserve the current URL when
      // we're already inside the activity's prefix.
      const alreadyOnRoute =
        location.pathname === activity.route ||
        location.pathname.startsWith(`${activity.route}/`);
      if (!alreadyOnRoute) {
        navigate(activity.route);
      }
    }
    wb.activateActivity(activity.id);
    // Spec workbench-unified-dockview.md §5 : l'activity bar ne ferme plus
    // d'éditeur. Cliquer une activité dont la vue par défaut est connue
    // (ex. Explorer → `explorer.tree`) la révèle/focus dans le dockview au
    // lieu de basculer un workspace.
    if (activity.defaultView) {
      wb.showView(activity.defaultView);
    }
    // Activités routées (Overview, Settings, Runs…) : l'éditeur s'ouvre via
    // `WorkbenchRouterSync` quand la navigation change. La branche ci-dessous
    // ne sert qu'au cas de récupération (clic alors qu'on est déjà sur la
    // route, dock vide) — d'où le garde-fou `editors.length === 0`.
    // Activités non routées (pages de plugins) : aucun autre chemin n'ouvre
    // leur éditeur, donc on l'ouvre/focus systématiquement — `openEditor` est
    // idempotent pour les singletons.
    if (activity.defaultEditor) {
      if (activity.route) {
        const editors = wb.listEditors();
        if (editors.length === 0) {
          wb.openEditor(activity.defaultEditor);
        }
      } else {
        wb.openEditor(activity.defaultEditor);
      }
    }
  };

  return (
    <aside
      className="flex shrink-0 flex-col items-center gap-1 border-r border-border px-2 py-2"
      style={{
        background:
          "linear-gradient(0deg, color-mix(in oklab, var(--activity-bar, var(--sidebar)) 80%, white) 0%, var(--activity-bar, var(--sidebar)) 55%, color-mix(in oklab, var(--activity-bar, var(--sidebar)) 92%, black) 100%)",
      }}
    >
      <NewResourceMenu
        side="right"
        align="start"
        sideOffset={8}
        triggerClassName="flex size-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-primary/90 [&_svg]:size-6"
      >
        <Plus />
      </NewResourceMenu>
      <div className="my-1 h-px w-6 bg-border" />
      {topActivities.map((a) => (
        <ActivityButton
          key={a.id}
          activity={a}
          isActive={activeActivity === a.id}
          onActivate={() => handleActivate(a)}
        />
      ))}
      <div className="flex-1" />
      <ThemeToggle />
      {bottomActivities.map((a) => (
        <ActivityButton
          key={a.id}
          activity={a}
          isActive={activeActivity === a.id}
          onActivate={() => handleActivate(a)}
        />
      ))}
      <div className="my-1 h-px w-6 bg-border" />
      <ChannelActivityButton />
    </aside>
  );
};

export default ActivityBar;
