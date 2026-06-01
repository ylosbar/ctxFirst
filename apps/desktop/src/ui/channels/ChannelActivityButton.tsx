import { useCallback, useEffect, useState } from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useServices } from "../di/services-provider";
import { useActiveChannel } from "./ChannelProvider";
import type { ChannelView } from "../../domain/workflow/types";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import CreateChannelDialog from "./CreateChannelDialog";
import EditChannelLogoDialog from "./EditChannelLogoDialog";
import ChannelIcon from "./ChannelIcon";

/**
 * Compact channel switcher sized to fit the ActivityBar (icon button).
 * Always visible — survives a collapsed PrimarySidebar. The glyph shows the
 * channel's uploaded image; falls back to a generic Layers icon when none is set.
 */
const ChannelActivityButton = () => {
  const { workflowGateway } = useServices();
  const { activeChannelId, setActiveChannel, channelVersion } =
    useActiveChannel();
  const [channels, setChannels] = useState<ReadonlyArray<ChannelView>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoTarget, setLogoTarget] = useState<ChannelView | null>(null);

  const refresh = useCallback(async () => {
    const list = await workflowGateway.listChannels();
    setChannels(list);
  }, [workflowGateway]);

  useEffect(() => {
    void refresh();
  }, [refresh, channelVersion]);

  const active = channels.find((c) => c.id === activeChannelId);
  const label = active?.name ?? activeChannelId;

  return (
    <>
      <MenuPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuPrimitive.Trigger
                aria-label={`Channel actif : ${label}`}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "rounded-[min(var(--radius-md),12px)] text-muted-foreground [&_svg]:size-6",
                )}
              >
                <ChannelIcon
                  channelId={active?.id}
                  hasImage={!!active?.iconImagePath}
                  className="size-6"
                />
              </MenuPrimitive.Trigger>
            }
          />
          <TooltipContent side="right">Channel : {label}</TooltipContent>
        </Tooltip>
        <MenuPrimitive.Portal>
          <MenuPrimitive.Positioner
            side="right"
            sideOffset={8}
            align="end"
            className="z-50"
          >
            <MenuPrimitive.Popup
              className={cn(
                "z-50 min-w-[14rem] origin-(--transform-origin) rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none",
                "transition-[opacity,transform,scale] duration-150",
                "data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
                "data-[ending-style]:opacity-0 data-[ending-style]:scale-95",
              )}
            >
              <MenuPrimitive.Group>
                <MenuPrimitive.GroupLabel className="px-2 py-1 text-2xs font-semibold tracking-wide uppercase text-muted-foreground">
                  Channels
                </MenuPrimitive.GroupLabel>
                {channels.map((c) => {
                  const selected = c.id === activeChannelId;
                  return (
                    <div key={c.id} className="group relative">
                      <MenuPrimitive.Item
                        onClick={async () => {
                          try {
                            await setActiveChannel(c.id);
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : String(err),
                            );
                          }
                        }}
                        className={cn(
                          "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 pr-8 text-sm outline-none",
                          "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                        )}
                      >
                        <ChannelIcon
                          channelId={c.id}
                          hasImage={!!c.iconImagePath}
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="flex-1 truncate">{c.name}</span>
                      </MenuPrimitive.Item>
                      {selected && (
                        <Check className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 group-hover:opacity-0" />
                      )}
                      <button
                        type="button"
                        aria-label={`Éditer le logo de ${c.name}`}
                        onClick={(e) => {
                          // Sibling of the menu item: keep the click from
                          // reaching the popup, then close it ourselves.
                          e.stopPropagation();
                          setMenuOpen(false);
                          setLogoTarget(c);
                        }}
                        className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground opacity-0 outline-none hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </MenuPrimitive.Group>
              <MenuPrimitive.Separator className="my-1 h-px bg-border" />
              <MenuPrimitive.Item
                onClick={() => setCreateOpen(true)}
                className={cn(
                  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                )}
              >
                <Plus className="size-3.5" />
                <span>Nouveau channel…</span>
              </MenuPrimitive.Item>
            </MenuPrimitive.Popup>
          </MenuPrimitive.Positioner>
        </MenuPrimitive.Portal>
      </MenuPrimitive.Root>
      <CreateChannelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async (id) => {
          await refresh();
          try {
            await setActiveChannel(id);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err));
          }
        }}
      />
      <EditChannelLogoDialog
        channel={logoTarget}
        onOpenChange={(open) => {
          if (!open) setLogoTarget(null);
        }}
        onSaved={refresh}
      />
    </>
  );
};

export default ChannelActivityButton;
