/**
 * Port for the *append-only* persistence of {@link DomainEvent}s. Together with
 * the {@link EventBus}, this is the source of truth for workflow state.
 *
 * Implementation: {@link createSqliteEventLog} (SQLite `wf_events` table).
 */
import type { DomainEvent } from "../../../domain/events";
import type { WorkflowId } from "../../../domain/ids";

export interface EventLog {
  /**
   * Appends an event. Duplicate `eventId` is ignored (idempotent) so re-publishing
   * an event that was already persisted is safe.
   */
  append(evt: DomainEvent): Promise<void>;
  /** Full history across all instances, in order — used at boot for re-hydration. */
  readAll(): Promise<ReadonlyArray<DomainEvent>>;
  /** History for a single instance, in order. */
  readByInstance(id: WorkflowId): Promise<ReadonlyArray<DomainEvent>>;
  /**
   * Returns the distinct instance ids whose events match the free-text `query`.
   * Matching is case-insensitive and performed on `instance_id`, `type`, and
   * the raw `payload_json`. Implementations SHOULD cap the result set.
   */
  searchInstanceIds(query: string, limit?: number): Promise<ReadonlyArray<WorkflowId>>;
  /** Removes every event associated with `id`. No-op when nothing matches. */
  deleteByInstance(id: WorkflowId): Promise<void>;
}
