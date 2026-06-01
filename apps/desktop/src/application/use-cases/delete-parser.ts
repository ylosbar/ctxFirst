import type { WorkflowGateway } from "../ports/workflow-gateway";
import type { ParserRefView } from "../../domain/workflow/types";

export const makeDeleteParser =
  (gateway: WorkflowGateway) => (ref: ParserRefView) =>
    gateway.deleteParser(ref);

export type DeleteParser = ReturnType<typeof makeDeleteParser>;
