import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServices } from "../di/services-provider";
import type { WfEvent } from "../../domain/workflow/types";

// Fenêtre de coalescence pour les bursts d'events (par ex. validate-then-advance).
// Identique au comportement précédent par hook, mais partagée pour que les
// timers ne se désynchronisent pas entre hooks consommateurs.
const INVALIDATE_DEBOUNCE_MS = 150;

// Map: WfEvent type → query keys à invalider. Les préfixes "racine"
// (`["instances"]`, `["awaiting-human"]`) invalident toutes les variantes
// (tous les canaux, toutes les `query`).
const EVENT_INVALIDATIONS: Record<string, ReadonlyArray<readonly string[]>> = {
  InstanceStarted: [["instances"]],
  InstanceCompleted: [["instances"], ["awaiting-human"]],
  InstanceFailed: [["instances"], ["awaiting-human"]],
  StepStarted: [["instances"]],
  StepAwaitingHumanGate: [["instances"], ["awaiting-human"]],
  StepValidated: [["instances"], ["awaiting-human"]],
  StepFailed: [["instances"], ["awaiting-human"]],
  LoopOpened: [["instances"], ["awaiting-human"]],
  LoopClosed: [["instances"], ["awaiting-human"]],
};

const WorkflowEventsBridge = () => {
  const services = useServices();
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Set<string>();

    const flush = () => {
      timer = null;
      for (const enc of pending) {
        const prefix = JSON.parse(enc) as readonly string[];
        void queryClient.invalidateQueries({ queryKey: prefix });
      }
      pending.clear();
    };

    const schedule = (prefixes: ReadonlyArray<readonly string[]>) => {
      for (const p of prefixes) pending.add(JSON.stringify(p));
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, INVALIDATE_DEBOUNCE_MS);
    };

    const unsub = services.subscribeWorkflow({
      onEvent: (evt: WfEvent) => {
        const targets = EVENT_INVALIDATIONS[evt.type];
        if (targets) schedule(targets);
      },
      onLlmSession: () => {},
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [services, queryClient]);

  return null;
};

export default WorkflowEventsBridge;
