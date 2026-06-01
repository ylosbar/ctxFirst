import type { WorkflowGateway } from "../ports/workflow-gateway";
import type { RunParserDraft } from "../../domain/workflow/types";

export const makeRunParser =
  (gateway: WorkflowGateway) => (input: RunParserDraft) =>
    gateway.runParser(input);

export type RunParser = ReturnType<typeof makeRunParser>;
