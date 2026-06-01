import type { WorkflowGateway } from "../ports/workflow-gateway";
import type {
  DebugStepInputView,
  DebugStepResultView,
} from "../../domain/workflow/types";

export const makeDebugStep =
  (gateway: WorkflowGateway) =>
  (input: DebugStepInputView): Promise<DebugStepResultView> =>
    gateway.debugStep(input);

export type DebugStep = ReturnType<typeof makeDebugStep>;
