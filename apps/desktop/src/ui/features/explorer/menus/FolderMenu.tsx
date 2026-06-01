import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import {
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "./menu-styles";
import { useT } from "@/ui/i18n";

type Props = {
  readonly trigger: ReactElement;
  readonly folderName: string;
  readonly onCreateChild: () => void;
  readonly onRename: () => void;
  readonly onDelete: () => void;
};

const FolderMenu = ({
  trigger,
  folderName,
  onCreateChild,
  onRename,
  onDelete,
}: Props) => {
  const t = useT();
  return (
  <ContextMenu.Root>
    <ContextMenu.Trigger render={trigger} />
    <ContextMenu.Portal>
      <ContextMenu.Positioner sideOffset={4} className="z-50">
        <ContextMenu.Popup className={menuPopupClass}>
          <Menu.Item className={menuItemClass} onClick={onCreateChild}>
            <FolderPlus className="size-4" />
            {t("explorer.menus.folder.newSubfolder")}
          </Menu.Item>
          <Menu.Item className={menuItemClass} onClick={onRename}>
            <Pencil className="size-4" />
            {t("explorer.menus.folder.rename")}
          </Menu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <Menu.Item
            className={menuItemDestructiveClass}
            onClick={() => {
              const ok = window.confirm(
                t("explorer.menus.folder.confirmDelete", { name: folderName }),
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

export default FolderMenu;
