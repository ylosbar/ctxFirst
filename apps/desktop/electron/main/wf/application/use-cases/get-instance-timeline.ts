/**
 * Read-only use-case: fetch the current projected {@link InstanceState}.
 * Pure query — does not mutate anything and does not hit the persistence layer
 * (reads from the in-memory {@link EngineState}).
 */
import type { EngineState } from "../engine-state";
import type { InstanceState } from "../../domain/projection";
import type { WorkflowId } from "../../domain/ids";

type Deps = { state: EngineState };

/** Query returning the state or `null` if the instance is unknown. */
export type GetInstanceTimeline = (id: WorkflowId) => Promise<InstanceState | null>;

export const makeGetInstanceTimeline =
  ({ state }: Deps): GetInstanceTimeline =>
  async (id) =>
    state.getInstance(id);
