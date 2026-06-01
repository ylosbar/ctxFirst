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
import type { TFunction } from "i18next";
import {
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "../explorer/menus/menu-styles";
import { useT } from "../../i18n";

type Actions = {
  readonly enabled: boolean;
  readonly hasLastRun: boolean;
  readonly onEdit: () => void;
  readonly onToggle: () => void;
  readonly onOpenLastRun: () => void;
  readonly onDelete: () => void;
};

const renderItems = (a: Actions, t: TFunction): ReactNode => (
  <>
    <Menu.Item className={menuItemClass} onClick={a.onEdit}>
      <Pencil className="size-4" />
      {t("schedules.leafMenu.edit")}
    </Menu.Item>
    <Menu.Item className={menuItemClass} onClick={a.onToggle}>
      {a.enabled ? (
        <>
          <Pause className="size-4" />
          {t("schedules.leafMenu.disable")}
        </>
      ) : (
        <>
          <Play className="size-4" />
          {t("schedules.leafMenu.enable")}
        </>
      )}
    </Menu.Item>
    {a.hasLastRun ? (
      <Menu.Item className={menuItemClass} onClick={a.onOpenLastRun}>
        <ExternalLink className="size-4" />
        {t("schedules.leafMenu.openLastRun")}
      </Menu.Item>
    ) : null}
    <div className="my-1 h-px bg-border" aria-hidden />
    <Menu.Item className={menuItemDestructiveClass} onClick={a.onDelete}>
      <Trash2 className="size-4" />
      {t("common.delete")}
    </Menu.Item>
  </>
);

type ContextProps = Actions & {
  readonly trigger: ReactElement;
};

export const ScheduleContextMenu = ({ trigger, ...actions }: ContextProps) => {
  const t = useT();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={trigger} />
      <ContextMenu.Portal>
        <ContextMenu.Positioner sideOffset={4} className="z-50">
          <ContextMenu.Popup className={menuPopupClass}>
            {renderItems(actions, t)}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

type DropdownProps = Actions & {
  readonly trigger: ReactElement;
};

export const ScheduleDropdownMenu = ({
  trigger,
  ...actions
}: DropdownProps) => {
  const t = useT();
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4} className="z-50">
          <Menu.Popup className={menuPopupClass}>
            {renderItems(actions, t)}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};
