/**
 * Free-text instance search.
 *
 * Uses SQLite (`EventLog.searchInstanceIds`) to narrow down which instances
 * match the query, then maps each hit through the in-memory {@link EngineState}
 * to produce the same {@link InstanceSummary} rows returned by `list-instances`.
 */
import type { ChannelContext } from "../ports/outbound/channel-context";
import type { EngineState } from "../engine-state";
import type { EventLog } from "../ports/outbound/event-log";
import { summarize, type InstanceSummary } from "../../domain/projection";

type Deps = { state: EngineState; log: EventLog; channels: ChannelContext };

export type SearchInstances = (
  query: string,
) => Promise<ReadonlyArray<InstanceSummary>>;

export const makeSearchInstances =
  ({ state, log, channels }: Deps): SearchInstances =>
  async (query) => {
    const active = channels.getActive();
    const trimmed = query.trim();
    if (!trimmed) return state.listInstances(active);

    const ids = await log.searchInstanceIds(trimmed);
    const rows: InstanceSummary[] = [];
    for (const id of ids) {
      const projected = state.getInstance(id);
      if (!projected) continue;
      if (projected.channelId !== active) continue;
      const events = state.eventsFor(id);
      const updatedAt =
        events.length > 0 ? events[events.length - 1].at : projected.createdAt;
      rows.push(summarize(projected, updatedAt));
    }
    rows.sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
    return rows;
  };
