import type { WorkflowGateway } from "../ports/workflow-gateway";
import type { LlmSessionEvent, WfEvent } from "../../domain/workflow/types";

type Subscriptions = {
  onEvent: (evt: WfEvent) => void;
  onLlmSession: (ev: LlmSessionEvent) => void;
};

export const makeSubscribeWorkflow =
  (gateway: WorkflowGateway) =>
  ({ onEvent, onLlmSession }: Subscriptions): (() => void) => {
    const offEvt = gateway.onEvent(onEvent);
    const offSession = gateway.onLlmSession(onLlmSession);
    return () => {
      offEvt();
      offSession();
    };
  };

export type SubscribeWorkflow = ReturnType<typeof makeSubscribeWorkflow>;
