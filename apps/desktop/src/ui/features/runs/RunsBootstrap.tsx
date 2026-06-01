import { useEffect, type ReactNode } from "react";
import { useServices } from "../../di/services-provider";
import {
  emitGateNotification,
  useRunsStore,
} from "../../stores/runs-store";
import type { WfEvent } from "../../../domain/workflow/types";

const LIST_REFRESH_DEBOUNCE_MS = 150;

const RELEVANT_EVENT_TYPES = new Set([
  "InstanceStarted",
  "InstanceCompleted",
  "StepStarted",
  "StepAwaitingHumanGate",
  "StepValidated",
  "StepFailed",
  "LoopOpened",
  "LoopClosed",
]);

const RunsBootstrap = ({ children }: { children: ReactNode }) => {
  const services = useServices();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = async () => {
      try {
        const rows = await services.listInstances();
        if (cancelled) return;
        useRunsStore.getState().setInstances(rows);
      } catch (e) {
        if (!cancelled) {
           
          console.error("[wf:ui] runs listInstances failed", e);
        }
      }
    };

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, LIST_REFRESH_DEBOUNCE_MS);
    };

    refresh();

    const unsub = services.subscribeWorkflow({
      onEvent: (evt: WfEvent) => {
        if (!RELEVANT_EVENT_TYPES.has(evt.type)) return;
        scheduleRefresh();
        if (evt.type === "StepAwaitingHumanGate" && evt.instanceId) {
          const id = evt.instanceId;
          if (id === useRunsStore.getState().activeInstanceId) return;
          emitGateNotification({ instanceId: id, at: Date.now() });
        }
      },
      onLlmSession: () => {},
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [services]);

  return <>{children}</>;
};

export default RunsBootstrap;
