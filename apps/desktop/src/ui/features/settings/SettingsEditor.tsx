import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronRight, Package, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveChannel } from "../../channels/ChannelProvider";
import CreateChannelDialog from "../../channels/CreateChannelDialog";
import ChannelIcon from "../../channels/ChannelIcon";
import type { ChannelView } from "../../../domain/workflow/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Section } from "@/components/ui/section";
import { useCollapsibleState } from "@/components/ui/use-collapsible-state";
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
import {
  STATE_TONE,
  type PermissionMeta,
  type PluginRow,
} from "./settings-editor/parts/plugin-constants";
import { formatError } from "./settings-editor/parts/format-error";
import { usePluginSettingsTabs } from "./settings-editor/hooks/use-plugin-settings-tabs";
import CategoryNav from "./settings-editor/components/CategoryNav";
import AppearancePanel from "./settings-editor/panels/AppearancePanel";
import GeneralPanel from "./settings-editor/panels/GeneralPanel";
import IntegrationsPanel from "./settings-editor/panels/IntegrationsPanel";
import LlmProviderPanel from "./settings-editor/panels/LlmProviderPanel";
import McpPanel from "./settings-editor/panels/McpPanel";

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

const PluginsPanel = () => {
  const t = useT();
  const {
    listPlugins,
    listPluginPermissions,
    openPluginFolder,
    setPluginPermission,
    setPluginEnabled,
    reloadPlugin,
    grantPlugin,
  } = useServices();

  const [plugins, setPlugins] = useState<ReadonlyArray<PluginRow> | null>(null);
  const [catalog, setCatalog] = useState<ReadonlyArray<PermissionMeta>>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDialog, setPendingDialog] = useState<PluginRow | null>(null);

  const refresh = async () => {
    try {
      const [list, cat] = await Promise.all([
        listPlugins(),
        listPluginPermissions(),
      ]);
      setPlugins(list);
      setCatalog(cat);
    } catch (err) {
      setError(formatError(err));
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFolder = async (pluginId?: string) => {
    try {
      await openPluginFolder({ pluginId });
    } catch (err) {
      setError(formatError(err));
    }
  };

  const togglePermission = async (
    p: PluginRow,
    permission: string,
    granted: boolean,
  ) => {
    try {
      await setPluginPermission({
        pluginId: p.id,
        permission,
        granted,
      });
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const toggleEnabled = async (p: PluginRow, enabled: boolean) => {
    try {
      await setPluginEnabled({ pluginId: p.id, enabled });
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const reload = async (p: PluginRow) => {
    try {
      await reloadPlugin({ pluginId: p.id });
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const grantAll = async (p: PluginRow) => {
    try {
      await grantPlugin({
        pluginId: p.id,
        version: p.version,
        permissions: p.declaredPermissions,
        enabled: true,
      });
      setPendingDialog(null);
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const deny = async (p: PluginRow) => {
    try {
      await grantPlugin({
        pluginId: p.id,
        version: p.version,
        permissions: [],
        enabled: false,
      });
      setPendingDialog(null);
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t("settings.plugins.title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("settings.plugins.description")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void openFolder()}>
          {t("settings.plugins.openFolder")}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {plugins === null ? (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        ) : plugins.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("settings.plugins.empty")}
          </p>
        ) : (
          plugins.map((p) => (
            <PluginCard
              key={p.id}
              plugin={p}
              catalogById={catalogById}
              onAuthorize={() => setPendingDialog(p)}
              onTogglePermission={(perm, granted) =>
                void togglePermission(p, perm, granted)
              }
              onToggleEnabled={(enabled) => void toggleEnabled(p, enabled)}
              onReload={() => void reload(p)}
              onOpenFolder={() => void openFolder(p.id)}
            />
          ))
        )}
      </div>
      {pendingDialog && (
        <AuthorizationDialog
          plugin={pendingDialog}
          catalogById={catalogById}
          onCancel={() => setPendingDialog(null)}
          onDeny={() => void deny(pendingDialog)}
          onGrant={() => void grantAll(pendingDialog)}
        />
      )}
    </section>
  );
};

type PluginCardProps = {
  plugin: PluginRow;
  catalogById: Map<string, PermissionMeta>;
  onAuthorize: () => void;
  onTogglePermission: (permission: string, granted: boolean) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onReload: () => void;
  onOpenFolder: () => void;
};

const PluginCard = ({
  plugin,
  catalogById,
  onAuthorize,
  onTogglePermission,
  onToggleEnabled,
  onReload,
  onOpenFolder,
}: PluginCardProps) => {
  const t = useT();
  const granted = new Set(plugin.grantedPermissions);
  const { open: isOpen, toggle } = useCollapsibleState({
    persistKey: `app.settings.plugins.${plugin.id}`,
    defaultOpen: plugin.state === "pending" || plugin.state === "failed",
  });
  const bodyId = `plugin-card-body-${plugin.id}`;
  return (
    <article className="flex flex-col rounded border border-border bg-card/40">
      <header className="flex items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              isOpen && "rotate-90",
            )}
          />
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-sm font-medium">
              <span className="text-primary">{plugin.name}</span>
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                {`v${plugin.version}`}
              </span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {plugin.id}
              {plugin.author ? ` · ${plugin.author}` : ""}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            tone={STATE_TONE[plugin.state]}
            size="sm"
            className="rounded uppercase"
          >
            {t(`settings.plugins.state.${plugin.state}`)}
          </Badge>
          <span
            className={cn(
              "rounded px-1.5 py-px text-2xs font-medium uppercase",
              plugin.source === "builtin"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/15 text-primary",
            )}
          >
            {plugin.source}
          </span>
        </div>
      </header>

      <div
        id={bodyId}
        data-open={isOpen ? "true" : "false"}
        className="grid transition-[grid-template-rows] duration-150 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
        aria-hidden={!isOpen}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2 px-3 pb-3">
            {plugin.description && (
              <p className="text-xs text-muted-foreground">
                {plugin.description}
              </p>
            )}
            {plugin.error && (
              <p className="rounded border border-destructive/40 bg-destructive/10 p-1.5 text-2xs text-destructive">
                {plugin.error}
              </p>
            )}

            {plugin.state === "pending" ? (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={onAuthorize}>
                  {t("settings.plugins.reviewPermissions")}
                </Button>
              </div>
            ) : (
              plugin.declaredPermissions.length > 0 && (
                <Section
                  title={
                    <span className="text-xs font-normal text-muted-foreground">
                      {t("settings.plugins.permissions", {
                        granted: granted.size,
                        total: plugin.declaredPermissions.length,
                      })}
                    </span>
                  }
                  collapsible
                  defaultOpen={false}
                  persistKey={`app.settings.plugin-permissions.${plugin.id}`}
                  density="compact"
                  level={4}
                >
                  <ul className="flex flex-col gap-1">
                    {plugin.declaredPermissions.map((perm) => {
                      const meta = catalogById.get(perm);
                      const isGranted = granted.has(perm);
                      return (
                        <li
                          key={perm}
                          className="flex items-start justify-between gap-2 rounded border border-border bg-background/40 px-2 py-1.5"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="font-mono text-2xs">
                              {meta?.label ?? perm}
                              {meta?.sensitive && (
                                <span className="ml-1 text-2xs text-amber-600 dark:text-amber-400">
                                  {t("settings.plugins.sensitive")}
                                </span>
                              )}
                            </span>
                            {meta?.rationale && (
                              <span className="text-2xs text-muted-foreground">
                                {meta.rationale}
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant={isGranted ? "outline" : "default"}
                            onClick={() =>
                              onTogglePermission(perm, !isGranted)
                            }
                          >
                            {isGranted
                              ? t("settings.plugins.revoke")
                              : t("settings.plugins.grant")}
                          </Button>
                        </li>
                      );
                    })}
                    {plugin.networkHosts.length > 0 && (
                      <li className="rounded border border-dashed border-border px-2 py-1.5 text-2xs text-muted-foreground">
                        <Trans
                          t={t}
                          i18nKey="settings.plugins.allowedHosts"
                          values={{
                            count: plugin.networkHosts.length,
                            hosts: plugin.networkHosts.join(", "),
                          }}
                          components={{ mono: <span className="font-mono" /> }}
                        />
                      </li>
                    )}
                  </ul>
                </Section>
              )
            )}

            <footer className="flex items-center justify-between gap-2 pt-1">
              <p className="text-2xs text-muted-foreground">
                {[
                  plugin.renderer ? "UI" : null,
                  plugin.contributions.stepKinds.length > 0
                    ? t("settings.plugins.stepKinds", {
                        count: plugin.contributions.stepKinds.length,
                      })
                    : null,
                  plugin.methods.length > 0
                    ? t("settings.plugins.ipcMethods", {
                        count: plugin.methods.length,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="flex items-center gap-1.5">
                {plugin.source === "user" && (
                  <Button size="sm" variant="ghost" onClick={onOpenFolder}>
                    {t("settings.plugins.folder")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onReload}>
                  {t("settings.plugins.reload")}
                </Button>
                {plugin.state === "active" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onToggleEnabled(false)}
                    disabled={plugin.core}
                    title={
                      plugin.core ? t("settings.plugins.coreTooltip") : undefined
                    }
                  >
                    {t("settings.plugins.disable")}
                  </Button>
                ) : plugin.state === "disabled" ? (
                  <Button size="sm" onClick={() => onToggleEnabled(true)}>
                    {t("settings.plugins.enable")}
                  </Button>
                ) : null}
              </div>
            </footer>
          </div>
        </div>
      </div>
    </article>
  );
};

type AuthorizationDialogProps = {
  plugin: PluginRow;
  catalogById: Map<string, PermissionMeta>;
  onCancel: () => void;
  onDeny: () => void;
  onGrant: () => void;
};

const AuthorizationDialog = ({
  plugin,
  catalogById,
  onCancel,
  onDeny,
  onGrant,
}: AuthorizationDialogProps) => {
  const t = useT();
  const { openExternalUrl } = useServices();
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[60] flex w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-md border border-border bg-card p-5 shadow-xl">
          <Dialog.Title className="text-sm font-semibold">
            {t("settings.plugins.authorize.title", { name: plugin.name })}
          </Dialog.Title>
          <p className="text-xs text-muted-foreground">
            {t("settings.plugins.authorize.description")}
            {plugin.homepage && (
              <>
                {" "}
                <a
                  className="underline"
                  href={plugin.homepage}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => {
                    e.preventDefault();
                    void openExternalUrl(plugin.homepage!);
                  }}
                >
                  {t("settings.plugins.authorize.homepage")}
                </a>
              </>
            )}
          </p>
          <ul className="flex flex-col gap-1.5">
            {plugin.declaredPermissions.map((perm) => {
              const meta = catalogById.get(perm);
              return (
                <li
                  key={perm}
                  className="rounded border border-border bg-background/40 px-2 py-1.5 text-xs"
                >
                  <p className="font-medium">
                    {meta?.label ?? perm}
                    {meta?.sensitive && (
                      <span className="ml-1 text-2xs text-amber-600 dark:text-amber-400">
                        {t("settings.plugins.sensitive")}
                      </span>
                    )}
                  </p>
                  {meta?.rationale && (
                    <p className="text-2xs text-muted-foreground">
                      {meta.rationale}
                    </p>
                  )}
                </li>
              );
            })}
            {plugin.networkHosts.length > 0 && (
              <li className="rounded border border-dashed border-border px-2 py-1.5 text-2xs text-muted-foreground">
                <Trans
                  t={t}
                  i18nKey="settings.plugins.authorize.allowedHosts"
                  values={{ hosts: plugin.networkHosts.join(", ") }}
                  components={{ mono: <span className="font-mono" /> }}
                />
              </li>
            )}
          </ul>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t("settings.plugins.authorize.later")}
            </Button>
            <Button variant="destructive" size="sm" onClick={onDeny}>
              {t("settings.plugins.authorize.deny")}
            </Button>
            <Button size="sm" onClick={onGrant}>
              {t("settings.plugins.authorize.grantAll")}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
