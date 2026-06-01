import type { Notifier } from "../../application/ports/outbound/notifier";
import type { StepExecId, WorkflowId } from "../../domain/ids";

export type FakeNotifier = Notifier & {
  readonly humanGates: ReadonlyArray<{
    instanceId: WorkflowId;
    stepExecId: StepExecId;
    role: string;
  }>;
  reset(): void;
};

export const createFakeNotifier = (): FakeNotifier => {
  const humanGates: { instanceId: WorkflowId; stepExecId: StepExecId; role: string }[] = [];

  return {
    async humanGateOpened(instanceId, stepExecId, role) {
      humanGates.push({ instanceId, stepExecId, role });
    },
    get humanGates() {
      return humanGates;
    },
    reset() {
      humanGates.length = 0;
    },
  };
};
