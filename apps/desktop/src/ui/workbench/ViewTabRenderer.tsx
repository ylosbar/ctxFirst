import { X } from "lucide-react";
import type { IDockviewPanelHeaderProps } from "dockview-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { workbenchRegistry } from "./registry";
import { useWorkbench } from "./store";
import type { ViewPanelParams } from "./dock-panels";

// Tab renderer for view panels (chat, inspector, etc.) — sibling of
// EditorTabRenderer. The close button calls `hideView` so the view's React
// state and last-known position are remembered (spec §2.2 / §4).
const ViewTabRenderer = (props: IDockviewPanelHeaderProps<ViewPanelParams>) => {
  const { params } = props;
  const wb = useWorkbench();
  const view = workbenchRegistry.getView(params.viewId);
  const title = view?.title ?? params.viewId;
  const Icon = view?.icon;

  const handleClose = (event: React.MouseEvent) => {
    event.stopPropagation();
    wb.hideView(params.viewId);
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault();
      wb.hideView(params.viewId);
    }
  };

  return (
    <div
      className={cn("group relative flex h-full items-center gap-1.5 pl-3 pr-6")}
      onMouseDown={handleMouseDown}
      title={title}
    >
      {Icon ? (
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-muted"
        />
      )}
      <span className="truncate text-xs">{title}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Fermer la vue"
        onClick={handleClose}
        className="absolute right-0.5 top-1/2 size-4 -translate-y-1/2 bg-background text-muted-foreground opacity-0 group-hover:opacity-100"
      >
        <X />
      </Button>
    </div>
  );
};

export default ViewTabRenderer;
