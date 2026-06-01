import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { ExternalLink, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import {
  menuItemClass,
  menuItemDestructiveClass,
  menuPopupClass,
} from "./menu-styles";
import { useT } from "@/ui/i18n";

type Props = {
  readonly trigger: ReactElement;
  readonly skillRef: string;
  readonly onOpen: () => void;
  readonly onDelete: () => void;
};

const PromptLeafMenu = ({ trigger, skillRef, onOpen, onDelete }: Props) => {
  const t = useT();
  return (
  <ContextMenu.Root>
    <ContextMenu.Trigger render={trigger} />
    <ContextMenu.Portal>
      <ContextMenu.Positioner sideOffset={4} className="z-50">
        <ContextMenu.Popup className={menuPopupClass}>
          <Menu.Item className={menuItemClass} onClick={onOpen}>
            <ExternalLink className="size-4" />
            {t("explorer.menus.prompt.open")}
          </Menu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <Menu.Item
            className={menuItemDestructiveClass}
            onClick={() => {
              const ok = window.confirm(
                t("explorer.menus.prompt.confirmDelete", { skillRef }),
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

export default PromptLeafMenu;
