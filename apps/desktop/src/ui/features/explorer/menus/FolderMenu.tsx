import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import {
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "./menu-styles";

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
}: Props) => (
  <ContextMenu.Root>
    <ContextMenu.Trigger render={trigger} />
    <ContextMenu.Portal>
      <ContextMenu.Positioner sideOffset={4} className="z-50">
        <ContextMenu.Popup className={menuPopupClass}>
          <Menu.Item className={menuItemClass} onClick={onCreateChild}>
            <FolderPlus className="size-4" />
            Nouveau sous-dossier
          </Menu.Item>
          <Menu.Item className={menuItemClass} onClick={onRename}>
            <Pencil className="size-4" />
            Renommer
          </Menu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <Menu.Item
            className={menuItemDestructiveClass}
            onClick={() => {
              const ok = window.confirm(
                `Supprimer le dossier "${folderName}" ? Les ressources qu'il contient remonteront à la racine.`,
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

export default FolderMenu;
