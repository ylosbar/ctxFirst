import type { EventLog } from "../../application/ports/outbound/event-log";
import type { DomainEvent } from "../../domain/events";
import type { WorkflowId } from "../../domain/ids";

export type FakeEventLog = EventLog & {
  /** All events ever appended, in append order. */
  readonly events: ReadonlyArray<DomainEvent>;
  reset(): void;
};

export const createFakeEventLog = (): FakeEventLog => {
  let events: DomainEvent[] = [];
  const seenIds = new Set<string>();

  return {
    async append(evt) {
      if (seenIds.has(evt.eventId)) return;
      seenIds.add(evt.eventId);
      events.push(evt);
    },
    async readAll() {
      return events.slice();
    },
    async readByInstance(id: WorkflowId) {
      return events.filter(
        (e) => (e as { instanceId?: WorkflowId }).instanceId === id,
      );
    },
    async searchInstanceIds(query, limit) {
      const q = query.toLowerCase();
      const seen = new Set<WorkflowId>();
      const out: WorkflowId[] = [];
      for (const e of events) {
        const iid = (e as { instanceId?: WorkflowId }).instanceId;
        if (!iid) continue;
        if (seen.has(iid)) continue;
        const blob = `${iid}|${e.type}|${JSON.stringify(e)}`.toLowerCase();
        if (!blob.includes(q)) continue;
        seen.add(iid);
        out.push(iid);
        if (limit !== undefined && out.length >= limit) break;
      }
      return out;
    },
    async deleteByInstance(id) {
      events = events.filter(
        (e) => (e as { instanceId?: WorkflowId }).instanceId !== id,
      );
    },
    get events() {
      return events;
    },
    reset() {
      events = [];
      seenIds.clear();
    },
  };
};
