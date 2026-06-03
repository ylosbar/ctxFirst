import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { Copy, Download, ExternalLink, Pencil, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import {
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "./menu-styles";
import { useT } from "@/ui/i18n";

type Props = {
  readonly trigger: ReactElement;
  readonly templateRef: string;
  readonly onOpen: () => void;
  readonly onDuplicate: () => void;
  readonly onExport: () => void;
  readonly onDelete: () => void;
};

const TemplateLeafMenu = ({
  trigger,
  templateRef,
  onOpen,
  onDuplicate,
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
            {t("explorer.menus.template.open")}
          </Menu.Item>
          <Menu.Item className={menuItemClass} onClick={onDuplicate}>
            <Copy className="size-4" />
            {t("explorer.menus.template.duplicate")}
          </Menu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={menuItemClass} onClick={onExport}>
            <Download className="size-4" />
            {t("explorer.menus.template.exportJson")}
          </Menu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={menuItemClass} onClick={onOpen}>
            <Pencil className="size-4" />
            {t("explorer.menus.template.rename")}
          </Menu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <Menu.Item
            className={menuItemDestructiveClass}
            onClick={() => {
              const ok = window.confirm(
                t("explorer.menus.template.confirmDelete", { templateRef }),
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

export default TemplateLeafMenu;
