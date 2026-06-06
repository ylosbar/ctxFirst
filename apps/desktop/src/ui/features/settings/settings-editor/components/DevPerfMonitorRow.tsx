import { useEffect, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useT } from "@/ui/i18n";
import { useServices } from "@/ui/di/services-provider";
import OnOffToggle from "./OnOffToggle";

/**
 * Dev-only toggle for the Sentry memory sampler (periodic `getAppMetrics`
 * gauges). Rendered only when `import.meta.env.DEV` — the setting is a no-op in
 * packaged builds. Persisted main-side; flipping it starts/stops the sampler
 * live, so no reload is needed.
 */
const DevPerfMonitorRow = () => {
  const t = useT();
  const { settingsGateway } = useServices();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsGateway
      .getDevPerfMonitoring()
      .then((v) => {
        if (!cancelled) setEnabled(v);
      })
      .catch(() => {
        if (!cancelled) setEnabled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [settingsGateway]);

  const onChange = async (next: boolean) => {
    setBusy(true);
    try {
      const applied = await settingsGateway.setDevPerfMonitoring(next);
      setEnabled(applied);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">
            {t("settings.general.perfMonitoring.title")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("settings.general.perfMonitoring.description")}
          </p>
        </div>
        <div className={cn("shrink-0", busy && "pointer-events-none opacity-60")}>
          <OnOffToggle
            value={enabled ?? true}
            onChange={(v) => void onChange(v)}
            onLabel={t("common.enabled")}
            offLabel={t("common.disabled")}
          />
        </div>
      </div>
    </div>
  );
};

export default DevPerfMonitorRow;
