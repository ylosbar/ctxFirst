import type Database from "better-sqlite3";
import type { EventLog } from "../../application/ports/outbound/event-log";
import type { DomainEvent } from "../../domain/events";
import { asWorkflowId, type WorkflowId } from "../../domain/ids";

type Deps = { db: Database.Database };

type Row = {
  event_id: string;
  instance_id: string;
  type: string;
  payload_json: string;
  occurred_at: string;
};

const rowToEvent = (row: Row): DomainEvent => {
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  return {
    ...payload,
    eventId: row.event_id,
    at: row.occurred_at,
    type: row.type,
  } as unknown as DomainEvent;
};

export const createSqliteEventLog = ({ db }: Deps): EventLog => {
  const insert = db.prepare(
    `INSERT INTO wf_events (event_id, instance_id, type, payload_json, occurred_at)
     VALUES (@event_id, @instance_id, @type, @payload_json, @occurred_at)
     ON CONFLICT(event_id) DO NOTHING`,
  );
  const selectAll = db.prepare(
    `SELECT event_id, instance_id, type, payload_json, occurred_at
     FROM wf_events ORDER BY id ASC`,
  );
  const selectByInstance = db.prepare(
    `SELECT event_id, instance_id, type, payload_json, occurred_at
     FROM wf_events WHERE instance_id = ? ORDER BY id ASC`,
  );
  const searchIds = db.prepare(
    `SELECT instance_id, MAX(id) AS last_id
     FROM wf_events
     WHERE instance_id LIKE @q COLLATE NOCASE
        OR type LIKE @q COLLATE NOCASE
        OR payload_json LIKE @q COLLATE NOCASE
     GROUP BY instance_id
     ORDER BY last_id DESC
     LIMIT @limit`,
  );
  const deleteByInstance = db.prepare(
    `DELETE FROM wf_events WHERE instance_id = ?`,
  );

  return {
    async append(evt: DomainEvent): Promise<void> {
      const instanceId = (evt as { instanceId?: string }).instanceId ?? "__no_instance__";
      const { eventId, at, type, ...rest } = evt;
      insert.run({
        event_id: eventId,
        instance_id: instanceId,
        type,
        payload_json: JSON.stringify(rest),
        occurred_at: at,
      });
    },
    async readAll(): Promise<ReadonlyArray<DomainEvent>> {
      return (selectAll.all() as Row[]).map(rowToEvent);
    },
    async readByInstance(id: WorkflowId): Promise<ReadonlyArray<DomainEvent>> {
      return (selectByInstance.all(id) as Row[]).map(rowToEvent);
    },
    async searchInstanceIds(
      query: string,
      limit = 200,
    ): Promise<ReadonlyArray<WorkflowId>> {
      const trimmed = query.trim();
      if (!trimmed) return [];
      const q = `%${trimmed}%`;
      const rows = searchIds.all({ q, limit }) as Array<{ instance_id: string }>;
      return rows.map((r) => asWorkflowId(r.instance_id));
    },
    async deleteByInstance(id: WorkflowId): Promise<void> {
      deleteByInstance.run(id);
    },
  };
};
