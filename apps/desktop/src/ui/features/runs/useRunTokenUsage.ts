import { useEffect, useMemo, useState } from "react";
import type { StepTokenUsage } from "@shared/wf/token-usage";
import { useServices } from "../../di/services-provider";
import type { InstanceView } from "../../../domain/workflow/types";

/**
 * Charge la consommation de tokens par étape pour un run, via un canal agrégé
 * (`wf:getRunTokenUsage`, une requête pour tout le run). Re-fetch uniquement
 * quand la signature des exécutions change (id + statut) : les tokens ne sont
 * écrits dans `wf_runs` qu'à la fin d'une étape, donc inutile de poller pendant
 * le streaming.
 */
const useRunTokenUsage = (
  instance: InstanceView | null,
): ReadonlyArray<StepTokenUsage> => {
  const services = useServices();
  const [usage, setUsage] = useState<ReadonlyArray<StepTokenUsage>>([]);

  const instanceId = instance?.id ?? null;
  const signature = useMemo(
    () =>
      (instance?.executions ?? [])
        .map((e) => `${e.id}:${e.status}`)
        .join("|"),
    [instance?.executions],
  );

  useEffect(() => {
    if (!instanceId) {
      setUsage([]);
      return;
    }
    let cancelled = false;
    services
      .getRunTokenUsage(instanceId)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch((err) => {

        console.error("[wf:ui] getRunTokenUsage failed", err);
      });
    return () => {
      cancelled = true;
    };
    // `signature` capture les changements de statut qui font apparaître de
    // nouveaux runs LLM dans le log.
  }, [services, instanceId, signature]);

  return usage;
};

export default useRunTokenUsage;
