import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  THEMES,
  useSetPreviewTheme,
  useSetTheme,
  useTheme,
  useThemeVariant,
} from "../stores/appearance-store";
import { useT } from "../i18n";

const ThemeToggle = () => {
  const t = useT();
  const theme = useTheme();
  const variant = useThemeVariant();
  const setTheme = useSetTheme();
  const previewTheme = useSetPreviewTheme();
  const Icon = variant === "dark" ? Moon : Sun;

  return (
    <MenuPrimitive.Root
      onOpenChange={(open) => {
        if (!open) previewTheme(null);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuPrimitive.Trigger
              aria-label="Select theme"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "size-9 [&_svg]:size-6",
              )}
            >
              <Icon />
            </MenuPrimitive.Trigger>
          }
        />
        <TooltipContent>{t("components.themeToggle.title")}</TooltipContent>
      </Tooltip>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner side="right" sideOffset={8} align="end" className="z-50">
          <MenuPrimitive.Popup
            onMouseLeave={() => previewTheme(null)}
            className={cn(
              "z-50 min-w-[12rem] origin-(--transform-origin) rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none",
              "transition-[opacity,transform,scale] duration-150",
              "data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
              "data-[ending-style]:opacity-0 data-[ending-style]:scale-95"
            )}
          >
            <MenuPrimitive.Group>
              <MenuPrimitive.GroupLabel className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                <Palette className="size-3.5" />
                {t("components.themeToggle.title")}
              </MenuPrimitive.GroupLabel>
              {THEMES.map((t) => {
                const selected = t.id === theme;
                return (
                  <MenuPrimitive.Item
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    onMouseEnter={() => previewTheme(t.id)}
                    onFocus={() => previewTheme(t.id)}
                    className={cn(
                      "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 pr-8 text-sm outline-none",
                      "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                    )}
                  >
                    <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                      {t.variant === "dark" ? "DARK" : "LIGHT"}
                    </span>
                    <span className="flex-1">{t.label}</span>
                    {selected && (
                      <Check className="absolute right-2 size-4" />
                    )}
                  </MenuPrimitive.Item>
                );
              })}
            </MenuPrimitive.Group>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
};

export default ThemeToggle;
