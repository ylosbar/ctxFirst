import type { ReviewCommentView } from "../../domain/workflow/types";
import type { WorkflowGateway } from "../ports/workflow-gateway";

type Input = {
  instanceId: string;
  stepExecId: string;
  toStepId: string;
  reason: string;
  comments?: ReadonlyArray<ReviewCommentView>;
};

export const makeRequestLoop = (gateway: WorkflowGateway) => (input: Input) =>
  gateway.openLoop(input);

export type RequestLoop = ReturnType<typeof makeRequestLoop>;
