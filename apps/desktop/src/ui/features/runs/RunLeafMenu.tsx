import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { Download, ExternalLink, Pin, PinOff, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import {
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "../explorer/menus/menu-styles";

type Props = {
  readonly trigger: ReactElement;
  readonly instanceId: string;
  readonly isPinned: boolean;
  readonly onOpen: () => void;
  readonly onPin: () => void;
  readonly onUnpin: () => void;
  readonly onExport: () => void;
  readonly onDelete: () => void;
};

const RunLeafMenu = ({
  trigger,
  instanceId,
  isPinned,
  onOpen,
  onPin,
  onUnpin,
  onExport,
  onDelete,
}: Props) => (
  <ContextMenu.Root>
    <ContextMenu.Trigger render={trigger} />
    <ContextMenu.Portal>
      <ContextMenu.Positioner sideOffset={4} className="z-50">
        <ContextMenu.Popup className={menuPopupClass}>
          <Menu.Item className={menuItemClass} onClick={onOpen}>
            <ExternalLink className="size-4" />
            Ouvrir
          </Menu.Item>
          {isPinned ? (
            <Menu.Item className={menuItemClass} onClick={onUnpin}>
              <PinOff className="size-4" />
              Désépingler
            </Menu.Item>
          ) : (
            <Menu.Item className={menuItemClass} onClick={onPin}>
              <Pin className="size-4" />
              Épingler
            </Menu.Item>
          )}
          <Menu.Item className={menuItemClass} onClick={onExport}>
            <Download className="size-4" />
            Exporter (JSON)
          </Menu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <Menu.Item
            className={menuItemDestructiveClass}
            onClick={() => {
              const ok = window.confirm(
                `Supprimer le run ${instanceId.slice(0, 8)} ? Cette action est définitive.`,
              );
              if (!ok) return;
              onDelete();
            }}
          >
            <Trash2 className="size-4" />
            Supprimer
          </Menu.Item>
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  </ContextMenu.Root>
);

export default RunLeafMenu;
