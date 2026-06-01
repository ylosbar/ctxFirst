import { useEffect, useRef } from "react";
import { Toast } from "@base-ui/react/toast";
import { AlertTriangle, X } from "lucide-react";
import { useWorkbench } from "../../workbench/WorkbenchProvider";
import { runUriFor } from "./run-uri";
import {
  onGateNotification,
  useInstancesById,
} from "../../stores/runs-store";

const TOAST_TIMEOUT_MS = 8000;

const RunsToaster = () => {
  const wb = useWorkbench();
  const instancesById = useInstancesById();
  const manager = Toast.useToastManager();
  const lastSeenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return onGateNotification((notif) => {
      const last = lastSeenRef.current.get(notif.instanceId) ?? 0;
      if (notif.at - last < 1000) return;
      lastSeenRef.current.set(notif.instanceId, notif.at);
      const summary = instancesById.get(notif.instanceId);
      const label = summary
        ? `${summary.templateId} · ${summary.id.slice(0, 6)}`
        : notif.instanceId.slice(0, 8);
      manager.add({
        id: `gate:${notif.instanceId}`,
        title: "Validation requise",
        description: `Le run ${label} attend une validation.`,
        timeout: TOAST_TIMEOUT_MS,
        priority: "high",
        actionProps: {
          children: "Ouvrir",
          onClick: () => {
            wb.openEditor(runUriFor(notif.instanceId), { focus: true });
          },
        },
      });
    });
  }, [manager, wb, instancesById]);

  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2 outline-none">
        {manager.toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className="pointer-events-auto flex flex-col gap-1 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <Toast.Title className="text-sm font-medium">
                  {toast.title}
                </Toast.Title>
                {toast.description ? (
                  <Toast.Description className="text-xs text-muted-foreground">
                    {toast.description}
                  </Toast.Description>
                ) : null}
              </div>
              <Toast.Close
                aria-label="Fermer"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3" />
              </Toast.Close>
            </div>
            {toast.actionProps ? (
              <div className="flex justify-end">
                <Toast.Action className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90" />
              </div>
            ) : null}
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
};

export default RunsToaster;
