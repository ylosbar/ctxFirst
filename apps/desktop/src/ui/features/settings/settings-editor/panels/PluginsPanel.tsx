import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/ui/i18n";
import { useServices } from "@/ui/di/services-provider";
import type { PermissionMeta, PluginRow } from "../parts/plugin-constants";
import { formatError } from "../parts/format-error";
import PluginCard from "../components/PluginCard";
import AuthorizationDialog from "../components/AuthorizationDialog";

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

export default PluginsPanel;
