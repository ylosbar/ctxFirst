/**
 * Port for pinging a human when a `human.gate` step requires their attention.
 * MVP adapter logs to console; v2 will push to Slack / OS notifications.
 */
import type { StepExecId, WorkflowId } from "../../../domain/ids";

export interface Notifier {
  /** Fired once per {@link StepAwaitingHumanGate} event. */
  humanGateOpened(instanceId: WorkflowId, stepExecId: StepExecId, role: string): Promise<void>;
}
