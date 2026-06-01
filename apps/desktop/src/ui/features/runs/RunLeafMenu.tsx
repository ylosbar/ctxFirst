import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { Download, ExternalLink, Pin, PinOff, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import {
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "../explorer/menus/menu-styles";
import { useT } from "@/ui/i18n";

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
}: Props) => {
  const t = useT();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={trigger} />
      <ContextMenu.Portal>
        <ContextMenu.Positioner sideOffset={4} className="z-50">
          <ContextMenu.Popup className={menuPopupClass}>
            <Menu.Item className={menuItemClass} onClick={onOpen}>
              <ExternalLink className="size-4" />
              {t("runs.leafMenu.open")}
            </Menu.Item>
            {isPinned ? (
              <Menu.Item className={menuItemClass} onClick={onUnpin}>
                <PinOff className="size-4" />
                {t("runs.leafMenu.unpin")}
              </Menu.Item>
            ) : (
              <Menu.Item className={menuItemClass} onClick={onPin}>
                <Pin className="size-4" />
                {t("runs.leafMenu.pin")}
              </Menu.Item>
            )}
            <Menu.Item className={menuItemClass} onClick={onExport}>
              <Download className="size-4" />
              {t("runs.leafMenu.exportJson")}
            </Menu.Item>
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <Menu.Item
              className={menuItemDestructiveClass}
              onClick={() => {
                const ok = window.confirm(
                  t("runs.leafMenu.confirmDelete", {
                    name: instanceId.slice(0, 8),
                  }),
                );
                if (!ok) return;
                onDelete();
              }}
            >
              <Trash2 className="size-4" />
              {t("common.delete")}
            </Menu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

export default RunLeafMenu;
