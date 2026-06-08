import { ChevronRight } from "lucide-react";
import { Trans } from "react-i18next";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { useCollapsibleState } from "@/components/ui/use-collapsible-state";
import { useT } from "@/ui/i18n";
import {
  STATE_TONE,
  type PermissionMeta,
  type PluginRow,
} from "../parts/plugin-constants";

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

export default PluginCard;
