/**
 * In-memory, event-sourced read model of every {@link WorkflowInstance}.
 *
 * Fed by:
 *  - the in-memory {@link EventBus} during runtime (subscribes to each event
 *    and calls `apply`);
 *  - {@link rehydrateFromEventLog} at boot (replays the full
 *    {@link EventLog}).
 *
 * Per-instance state is built incrementally: each instance owns a mutable
 * {@link ProjectionScratch} that {@link applyEvent} updates in O(1) per event,
 * and {@link finalize} materializes into the cached read model. The old
 * implementation called `project(allEvents)` on every event, which was O(N²).
 */
import {
  applyEvent,
  createScratch,
  finalize,
  summarize,
  type InstanceState,
  type InstanceSummary,
  type ProjectionScratch,
} from "../domain/projection";
import type { EventLog } from "./ports/outbound/event-log";
import type { WorkflowId } from "../domain/ids";
import type { DomainEvent } from "../domain/events";

/**
 * Read model API. `apply` mutates the in-memory cache; accessors never mutate.
 */
export type EngineState = {
  /** Adds an event to its instance bucket and refreshes the cached projection. */
  apply(evt: DomainEvent): void;
  /** Returns the cached {@link InstanceState} for `id`, or `null`. */
  getInstance(id: WorkflowId): InstanceState | null;
  /**
   * Every known instance id (ordered by first-seen). When `channelId` is set,
   * only instances pinned to that channel are returned.
   */
  listInstanceIds(channelId?: string): ReadonlyArray<WorkflowId>;
  /** Raw events for an instance, in order. */
  eventsFor(id: WorkflowId): ReadonlyArray<DomainEvent>;
  /**
   * Compact per-instance rows for the listing UI, sorted by `updatedAt desc`.
   * When `channelId` is set, filters by channel.
   */
  listInstances(channelId?: string): ReadonlyArray<InstanceSummary>;
  /** Evicts an instance from the in-memory read model. */
  removeInstance(id: WorkflowId): void;
};

export const createEngineState = (): EngineState => {
  const eventsByInstance = new Map<WorkflowId, DomainEvent[]>();
  const scratches = new Map<WorkflowId, ProjectionScratch>();
  const cache = new Map<WorkflowId, InstanceState>();

  const apply = (evt: DomainEvent) => {
    const iid = (evt as { instanceId?: WorkflowId }).instanceId;
    if (!iid) return;
    const list = eventsByInstance.get(iid) ?? [];
    list.push(evt);
    eventsByInstance.set(iid, list);
    let scratch = scratches.get(iid);
    if (!scratch) {
      scratch = createScratch();
      scratches.set(iid, scratch);
    }
    applyEvent(scratch, evt);
    const state = finalize(scratch);
    if (state) cache.set(iid, state);
  };

  return {
    apply,
    getInstance(id: WorkflowId): InstanceState | null {
      return cache.get(id) ?? null;
    },
    listInstanceIds(channelId?: string): ReadonlyArray<WorkflowId> {
      const all = [...eventsByInstance.keys()];
      if (channelId === undefined) return all;
      return all.filter((id) => {
        const state = cache.get(id);
        return state?.channelId === channelId;
      });
    },
    eventsFor(id: WorkflowId): ReadonlyArray<DomainEvent> {
      return eventsByInstance.get(id) ?? [];
    },
    listInstances(channelId?: string): ReadonlyArray<InstanceSummary> {
      const rows: InstanceSummary[] = [];
      for (const [id, events] of eventsByInstance) {
        const state = cache.get(id);
        if (!state) continue;
        if (channelId !== undefined && state.channelId !== channelId) continue;
        const updatedAt = events.length > 0 ? events[events.length - 1].at : state.createdAt;
        rows.push(summarize(state, updatedAt));
      }
      rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
      return rows;
    },
    removeInstance(id: WorkflowId): void {
      eventsByInstance.delete(id);
      scratches.delete(id);
      cache.delete(id);
    },
  };
};

/**
 * Replays every event from the {@link EventLog} into `state`. Call once, at
 * boot, **before** starting the orchestrator so it sees a fully re-hydrated
 * state.
 */
export const rehydrateFromEventLog = async (
  state: EngineState,
  log: EventLog,
): Promise<void> => {
  const all = await log.readAll();
  for (const evt of all) state.apply(evt);
};
