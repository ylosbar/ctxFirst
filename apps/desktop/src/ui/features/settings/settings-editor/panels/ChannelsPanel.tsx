import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Trans } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/ui/i18n";
import { useServices } from "@/ui/di/services-provider";
import { useActiveChannel } from "@/ui/channels/ChannelProvider";
import CreateChannelDialog from "@/ui/channels/CreateChannelDialog";
import ChannelIcon from "@/ui/channels/ChannelIcon";
import type { ChannelView } from "@/domain/workflow/types";

const DEFAULT_CHANNEL_ID = "personal";

const ChannelsPanel = () => {
  const t = useT();
  const { workflowGateway } = useServices();
  const { activeChannelId, setActiveChannel } = useActiveChannel();
  const [channels, setChannels] = useState<ReadonlyArray<ChannelView>>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = async () => {
    const list = await workflowGateway.listChannels();
    setChannels(list);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDelete = async (id: string) => {
    if (id === DEFAULT_CHANNEL_ID) return;
    const confirmed = window.confirm(
      t("settings.channels.deleteConfirm", { id }),
    );
    if (!confirmed) return;
    try {
      await workflowGateway.deleteChannel(id);
      await refresh();
      toast.success(t("settings.channels.deleted", { id }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t("settings.channels.title")}</p>
          <p className="text-xs text-muted-foreground">
            <Trans
              t={t}
              i18nKey="settings.channels.description"
              components={{ mono: <span className="font-mono" /> }}
            />
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          {t("settings.channels.new")}
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded border border-border">
        {channels.map((c) => {
          const isActive = c.id === activeChannelId;
          const isDefault = c.id === DEFAULT_CHANNEL_ID;
          return (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={async () => {
                  try {
                    await setActiveChannel(c.id);
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : String(err),
                    );
                  }
                }}
              >
                <ChannelIcon
                  channelId={c.id}
                  hasImage={!!c.iconImagePath}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="truncate text-sm">{c.name}</span>
                <span className="font-mono text-2xs text-muted-foreground">
                  {c.id}
                </span>
                {isActive && (
                  <Badge tone="success" size="sm" className="ml-2 rounded">
                    {t("settings.channels.active")}
                  </Badge>
                )}
                {isDefault && (
                  <Badge tone="neutral" size="sm" className="ml-2 rounded">
                    {t("settings.channels.default")}
                  </Badge>
                )}
              </button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={isDefault}
                onClick={() => void onDelete(c.id)}
                title={
                  isDefault
                    ? t("settings.channels.cannotDeleteDefault")
                    : t("common.delete")
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
      <CreateChannelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => refresh()}
      />
    </section>
  );
};

export default ChannelsPanel;
