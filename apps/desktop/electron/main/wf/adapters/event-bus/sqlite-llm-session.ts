import type Database from "better-sqlite3";
import type {
  LlmSessionBus,
  LlmSessionEvent,
  LlmSessionHandler,
  LlmSessionPayload,
  Unsubscribe,
} from "../../application/ports/outbound/event-bus";

type Deps = { db: Database.Database };

type Row = {
  step_exec_id: string;
  seq: number;
  session_id: string | null;
  payload_json: string;
};

const rowToEvent = (r: Row): LlmSessionEvent => ({
  stepExecId: r.step_exec_id,
  seq: r.seq,
  sessionId: r.session_id ?? undefined,
  payload: JSON.parse(r.payload_json) as LlmSessionPayload,
});

export const createSqliteLlmSessionBus = ({ db }: Deps): LlmSessionBus => {
  const insert = db.prepare(
    `INSERT INTO wf_llm_session_events (step_exec_id, seq, session_id, payload_json)
     VALUES (@step_exec_id, @seq, @session_id, @payload_json)
     ON CONFLICT(step_exec_id, seq) DO NOTHING`,
  );
  const selectByStep = db.prepare(
    `SELECT step_exec_id, seq, session_id, payload_json
     FROM wf_llm_session_events
     WHERE step_exec_id = ?
     ORDER BY seq ASC`,
  );

  const handlers = new Set<LlmSessionHandler>();
  return {
    emit(evt: LlmSessionEvent) {
      insert.run({
        step_exec_id: evt.stepExecId,
        seq: evt.seq,
        session_id: evt.sessionId ?? null,
        payload_json: JSON.stringify(evt.payload),
      });
      for (const h of handlers) h(evt);
    },
    subscribe(h: LlmSessionHandler): Unsubscribe {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    getReplay(stepExecId: string): ReadonlyArray<LlmSessionEvent> {
      return (selectByStep.all(stepExecId) as Row[]).map(rowToEvent);
    },
  };
};
