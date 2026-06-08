import { Dialog } from "@base-ui/react/dialog";
import { Trans } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useT } from "@/ui/i18n";
import { useServices } from "@/ui/di/services-provider";
import type { PermissionMeta, PluginRow } from "../parts/plugin-constants";

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

export default AuthorizationDialog;
