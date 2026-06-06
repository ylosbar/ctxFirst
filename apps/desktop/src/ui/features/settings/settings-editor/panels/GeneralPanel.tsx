import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/ui/i18n";
import { useServices } from "@/ui/di/services-provider";
import { clearPersistedAppearance } from "@/ui/stores/appearance-store";
import DevPerfMonitorRow from "../components/DevPerfMonitorRow";

const GeneralPanel = () => {
  const t = useT();
  const { settingsGateway } = useServices();
  const [busy, setBusy] = useState(false);

  const onResetAll = async () => {
    const confirmed = window.confirm(t("settings.general.resetAll.confirm"));
    if (!confirmed) return;
    setBusy(true);
    try {
      await settingsGateway.clearAllSettings();
      // Préférences purement renderer (thème/langue/densité).
      clearPersistedAppearance();
      toast.success(t("settings.general.resetAll.success"));
      // Repart sur un état propre : recharge la fenêtre.
      window.location.reload();
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const onWipeAll = async () => {
    const confirmed = window.confirm(t("settings.general.wipeAll.confirm"));
    if (!confirmed) return;
    setBusy(true);
    try {
      // Efface aussi les préférences renderer avant la fermeture : le main vide
      // la base + le disque puis tue le process, mais le localStorage lui
      // survit (il est lié à l'origine du renderer).
      clearPersistedAppearance();
      // Ne résout jamais : le main tue l'app aussitôt la base wipée.
      // L'utilisateur rouvrira l'app lui-même.
      await settingsGateway.factoryReset();
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="flex flex-col gap-4">
      {import.meta.env.DEV && <DevPerfMonitorRow />}

      <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-destructive">
              {t("settings.general.resetAll.title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.general.resetAll.description")}
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void onResetAll()}
            disabled={busy}
            className="shrink-0"
          >
            <Trash2 className="size-4" />
            {t("settings.general.resetAll.button")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-destructive">
              {t("settings.general.wipeAll.title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.general.wipeAll.description")}
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void onWipeAll()}
            disabled={busy}
            className="shrink-0"
          >
            <Trash2 className="size-4" />
            {t("settings.general.wipeAll.button")}
          </Button>
        </div>
      </div>
    </section>
  );
};

export default GeneralPanel;
