/**
 * Read-only use-case: returns a compact, UI-friendly row per known workflow
 * instance. Pure query — reads from the in-memory {@link EngineState}.
 */
import type { ChannelContext } from "../ports/outbound/channel-context";
import type { EngineState } from "../engine-state";
import type { InstanceSummary } from "../../domain/projection";

type Deps = { state: EngineState; channels: ChannelContext };

export type ListInstances = () => Promise<ReadonlyArray<InstanceSummary>>;

export const makeListInstances =
  ({ state, channels }: Deps): ListInstances =>
  async () =>
    state.listInstances(channels.getActive());
