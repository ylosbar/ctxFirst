import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import {
  ExternalLink,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import {
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "../explorer/menus/menu-styles";

type Actions = {
  readonly enabled: boolean;
  readonly hasLastRun: boolean;
  readonly onEdit: () => void;
  readonly onToggle: () => void;
  readonly onOpenLastRun: () => void;
  readonly onDelete: () => void;
};

const renderItems = (a: Actions): ReactNode => (
  <>
    <Menu.Item className={menuItemClass} onClick={a.onEdit}>
      <Pencil className="size-4" />
      Éditer
    </Menu.Item>
    <Menu.Item className={menuItemClass} onClick={a.onToggle}>
      {a.enabled ? (
        <>
          <Pause className="size-4" />
          Désactiver
        </>
      ) : (
        <>
          <Play className="size-4" />
          Activer
        </>
      )}
    </Menu.Item>
    {a.hasLastRun ? (
      <Menu.Item className={menuItemClass} onClick={a.onOpenLastRun}>
        <ExternalLink className="size-4" />
        Ouvrir le dernier run
      </Menu.Item>
    ) : null}
    <div className="my-1 h-px bg-border" aria-hidden />
    <Menu.Item className={menuItemDestructiveClass} onClick={a.onDelete}>
      <Trash2 className="size-4" />
      Supprimer
    </Menu.Item>
  </>
);

type ContextProps = Actions & {
  readonly trigger: ReactElement;
};

export const ScheduleContextMenu = ({ trigger, ...actions }: ContextProps) => (
  <ContextMenu.Root>
    <ContextMenu.Trigger render={trigger} />
    <ContextMenu.Portal>
      <ContextMenu.Positioner sideOffset={4} className="z-50">
        <ContextMenu.Popup className={menuPopupClass}>
          {renderItems(actions)}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  </ContextMenu.Root>
);

type DropdownProps = Actions & {
  readonly trigger: ReactElement;
};

export const ScheduleDropdownMenu = ({
  trigger,
  ...actions
}: DropdownProps) => (
  <Menu.Root>
    <Menu.Trigger render={trigger} />
    <Menu.Portal>
      <Menu.Positioner align="end" sideOffset={4} className="z-50">
        <Menu.Popup className={menuPopupClass}>
          {renderItems(actions)}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>
);
