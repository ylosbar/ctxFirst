import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Package, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveChannel } from "../../channels/ChannelProvider";
import CreateChannelDialog from "../../channels/CreateChannelDialog";
import ChannelIcon from "../../channels/ChannelIcon";
import type { ChannelView } from "../../../domain/workflow/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trans } from "react-i18next";
import { useT } from "../../i18n";
import { useServices } from "../../di/services-provider";
import {
  CORE_CATEGORY_DEFS,
  DEFAULT_CATEGORY,
  SETTINGS_PREFIX,
  categoryFromPath,
  type Category,
  type CategoryId,
} from "./settings-editor/parts/categories";
import { usePluginSettingsTabs } from "./settings-editor/hooks/use-plugin-settings-tabs";
import CategoryNav from "./settings-editor/components/CategoryNav";
import AppearancePanel from "./settings-editor/panels/AppearancePanel";
import GeneralPanel from "./settings-editor/panels/GeneralPanel";
import IntegrationsPanel from "./settings-editor/panels/IntegrationsPanel";
import LlmProviderPanel from "./settings-editor/panels/LlmProviderPanel";
import McpPanel from "./settings-editor/panels/McpPanel";
import PluginsPanel from "./settings-editor/panels/PluginsPanel";

const SettingsEditor = () => {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const pluginTabs = usePluginSettingsTabs();

  const categories: readonly Category[] = useMemo(
    () => [
      ...CORE_CATEGORY_DEFS.map((c) => ({
        id: c.id,
        label: t(c.labelKey),
        icon: c.icon,
      })),
      ...pluginTabs.map((pt) => ({
        id: pt.id,
        label: pt.label,
        icon: pt.icon ?? Package,
      })),
    ],
    [t, pluginTabs],
  );

  const requestedCategory = categoryFromPath(location.pathname);
  const isValidCategory = useMemo(
    () =>
      requestedCategory != null &&
      categories.some((c) => c.id === requestedCategory),
    [requestedCategory, categories],
  );
  const activeCategoryId: CategoryId = isValidCategory
    ? (requestedCategory as CategoryId)
    : DEFAULT_CATEGORY;

  // Defensive rewrite: if the URL points to a category that doesn't exist
  // (yet — plugins boot asynchronously), wait one tick before falling back to
  // the default. This avoids stomping `/settings/openrouter` on startup when
  // the plugin tab will be registered shortly after mount.
  useEffect(() => {
    if (requestedCategory == null) return;
    if (isValidCategory) return;
    const handle = window.setTimeout(() => {
      navigate(`${SETTINGS_PREFIX}/${DEFAULT_CATEGORY}`, { replace: true });
    }, 50);
    return () => window.clearTimeout(handle);
  }, [requestedCategory, isValidCategory, navigate]);

  // First-mount canonicalization: `/settings` → `/settings/appearance`.
  // The settings editor is a singleton — its panel stays mounted in the dock
  // even after the user navigates to another activity, so this effect keeps
  // running with the *new* pathname. `categoryFromPath` returns null both for
  // the bare `/settings` root AND for any non-settings route, so only
  // canonicalize when we're actually on the settings root; otherwise we'd yank
  // the user back to `/settings` the moment they leave it.
  useEffect(() => {
    if (requestedCategory != null) return;
    const onSettingsRoot =
      location.pathname === SETTINGS_PREFIX ||
      location.pathname === `${SETTINGS_PREFIX}/`;
    if (!onSettingsRoot) return;
    navigate(`${SETTINGS_PREFIX}/${DEFAULT_CATEGORY}`, { replace: true });
  }, [requestedCategory, location.pathname, navigate]);

  const setActiveCategory = useCallback(
    (id: CategoryId) => {
      navigate(`${SETTINGS_PREFIX}/${encodeURIComponent(id)}`, {
        replace: true,
      });
    },
    [navigate],
  );

  const activePluginTab =
    pluginTabs.find((pt) => pt.id === activeCategoryId) ?? null;
  const categoryLabel =
    categories.find((c) => c.id === activeCategoryId)?.label ?? "";

  return (
    <div className="flex h-full min-w-0 flex-row bg-background text-foreground">
      <CategoryNav
        categories={categories}
        active={activeCategoryId}
        onSelect={setActiveCategory}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader className="px-6" title={categoryLabel} />
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-8 px-6 py-6">
            {activeCategoryId === "appearance" && <AppearancePanel />}
            {activeCategoryId === "channels" && <ChannelsPanel />}
            {activeCategoryId === "integrations" && <IntegrationsPanel />}
            {activeCategoryId === "llm" && <LlmProviderPanel />}
            {activeCategoryId === "mcp" && <McpPanel />}
            {activeCategoryId === "plugins" && <PluginsPanel />}
            {activeCategoryId === "general" && <GeneralPanel />}
            {activePluginTab && (
              <div className="flex flex-col gap-4">
                {activePluginTab.element}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

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

export default SettingsEditor;
