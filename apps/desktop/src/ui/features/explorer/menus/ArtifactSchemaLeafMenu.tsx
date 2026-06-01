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
  readonly typeRef: string;
  readonly isUserDefined: boolean;
  readonly onOpen: () => void;
  readonly onDelete: () => void;
};

const ArtifactSchemaLeafMenu = ({
  trigger,
  typeRef,
  isUserDefined,
  onOpen,
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
            {t("explorer.menus.artifactSchema.open")}
          </Menu.Item>
          {isUserDefined ? (
            <>
              <ContextMenu.Separator className="my-1 h-px bg-border" />
              <Menu.Item
                className={menuItemDestructiveClass}
                onClick={() => {
                  const ok = window.confirm(
                    t("explorer.menus.artifactSchema.confirmDelete", {
                      typeRef,
                    }),
                  );
                  if (!ok) return;
                  onDelete();
                }}
              >
                <Trash2 className="size-4" />
                {t("common.delete")}
              </Menu.Item>
            </>
          ) : null}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  </ContextMenu.Root>
  );
};

export default ArtifactSchemaLeafMenu;
