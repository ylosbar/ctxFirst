import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { Copy, Download, ExternalLink, Pencil } from "lucide-react";
import type { ReactElement } from "react";
import {
  menuItemClass,
  menuPopupClass,
} from "./menu-styles";

type Props = {
  readonly trigger: ReactElement;
  readonly onOpen: () => void;
  readonly onDuplicate: () => void;
  readonly onExport: () => void;
};

const TemplateLeafMenu = ({
  trigger,
  onOpen,
  onDuplicate,
  onExport,
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
          <Menu.Item className={menuItemClass} onClick={onDuplicate}>
            <Copy className="size-4" />
            Dupliquer
          </Menu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={menuItemClass} onClick={onExport}>
            <Download className="size-4" />
            Exporter en JSON
          </Menu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={menuItemClass} onClick={onOpen}>
            <Pencil className="size-4" />
            Renommer
          </Menu.Item>
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  </ContextMenu.Root>
);

export default TemplateLeafMenu;
