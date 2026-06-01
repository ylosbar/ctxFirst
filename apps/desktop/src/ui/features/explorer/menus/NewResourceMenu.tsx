import { Menu } from "@base-ui/react/menu";
import { Network, ShieldCheck, Variable } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useWorkbench } from "../../../workbench/WorkbenchProvider";
import { EXPLORER_NEW_URIS, KIND_ICON_COLOR } from "../build-tree";
import { menuItemClass, menuPopupClass } from "./menu-styles";

type NewResourceMenuProps = {
  /** Content rendered inside the trigger button (e.g. a `<Plus />` icon). */
  readonly children: ReactNode;
  /** Classes applied to the trigger button so each surface can style it. */
  readonly triggerClassName?: string;
  /** Accessible label for the trigger; defaults to the shared i18n key. */
  readonly triggerLabel?: string;
  readonly align?: "start" | "center" | "end";
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly sideOffset?: number;
};

const iconClass = "size-4";

/**
 * Shared "create a new resource" dropdown (template / prompt / artifact type).
 * Opens the relevant `*://new` editor via the workbench. Used both by the
 * Explorer tree header and the prominent button in the activity bar.
 */
const NewResourceMenu = ({
  children,
  triggerClassName,
  triggerLabel,
  align = "end",
  side,
  sideOffset = 4,
}: NewResourceMenuProps) => {
  const wb = useWorkbench();
  const { t } = useTranslation();
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={triggerLabel ?? t("explorer.resourceTree.newResource")}
        title={triggerLabel ?? t("explorer.resourceTree.newResource")}
        className={triggerClassName}
      >
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          align={align}
          side={side}
          sideOffset={sideOffset}
          className="z-[100]"
        >
          <Menu.Popup className={menuPopupClass}>
            <Menu.Item
              className={menuItemClass}
              onClick={() =>
                wb.openEditor(EXPLORER_NEW_URIS.template, { focus: true })
              }
            >
              <Network className={cn(iconClass, KIND_ICON_COLOR.templates)} />
              {t("explorer.resourceTree.menu.newTemplate")}
            </Menu.Item>
            <Menu.Item
              className={menuItemClass}
              onClick={() =>
                wb.openEditor(EXPLORER_NEW_URIS.skill, { focus: true })
              }
            >
              <Variable className={cn(iconClass, KIND_ICON_COLOR.prompts)} />
              {t("explorer.resourceTree.menu.newPrompt")}
            </Menu.Item>
            <Menu.Item
              className={menuItemClass}
              onClick={() =>
                wb.openEditor(EXPLORER_NEW_URIS.artifactSchema, { focus: true })
              }
            >
              <ShieldCheck
                className={cn(iconClass, KIND_ICON_COLOR["artifact-schemas"])}
              />
              {t("explorer.resourceTree.menu.newArtifactType")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

export default NewResourceMenu;
