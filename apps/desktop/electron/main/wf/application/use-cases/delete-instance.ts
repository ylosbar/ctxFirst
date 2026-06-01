import type { EventLog } from "../ports/outbound/event-log";
import type { EngineState } from "../engine-state";
import type { WorkflowId } from "../../domain/ids";

type Deps = { log: EventLog; state: EngineState };

export type DeleteInstance = (id: WorkflowId) => Promise<void>;

export const makeDeleteInstance =
  ({ log, state }: Deps): DeleteInstance =>
  async (id) => {
    await log.deleteByInstance(id);
    state.removeInstance(id);
  };
