import { X } from "lucide-react";
import type { IDockviewPanelHeaderProps } from "dockview-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { workbenchRegistry } from "./registry";
import { useT } from "../i18n";
import type { EditorPanelParams } from "./WorkbenchProvider";

const EditorTabRenderer = (
  props: IDockviewPanelHeaderProps<EditorPanelParams>,
) => {
  const { api, params } = props;
  const { uri } = params;
  // Subscribe to i18n so editor titles built via i18n.t() refresh on locale change.
  useT();
  const type = workbenchRegistry.editorTypeFor(uri);
  const title = type ? type.title(uri) : uri;
  const Icon = type?.icon?.(uri);
  const iconClassName = type?.iconClassName ?? "text-muted-foreground";

  const handleClose = (event: React.MouseEvent) => {
    event.stopPropagation();
    api.close();
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault();
      api.close();
    }
  };

  return (
    <div
      className={cn("group relative flex h-full items-center gap-1.5 pl-3 pr-6")}
      onMouseDown={handleMouseDown}
      title={title}
    >
      {Icon ? (
        <Icon className={cn("size-3.5 shrink-0", iconClassName)} />
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
        aria-label="Fermer l'onglet"
        onClick={handleClose}
        className="absolute right-0.5 top-1/2 size-4 -translate-y-1/2 bg-background text-muted-foreground opacity-0 group-hover:opacity-100"
      >
        <X />
      </Button>
    </div>
  );
};

export default EditorTabRenderer;
