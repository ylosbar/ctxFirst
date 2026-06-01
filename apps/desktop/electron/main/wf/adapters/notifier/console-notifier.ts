import type { Notifier } from "../../application/ports/outbound/notifier";
import type { StepExecId, WorkflowId } from "../../domain/ids";

export const createConsoleNotifier = (): Notifier => ({
  async humanGateOpened(
    instanceId: WorkflowId,
    stepExecId: StepExecId,
    role: string,
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[wf] human gate opened: instance=${instanceId} exec=${stepExecId} role=${role}`);
  },
});
