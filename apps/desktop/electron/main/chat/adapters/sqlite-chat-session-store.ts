import type Database from "better-sqlite3";
import type {
  ChatSession,
  ChatSessionSummary,
  ChatViewContextSnapshot,
} from "../domain/chat-session";
import type { ChatSessionStore } from "../application/ports/outbound/chat-session-store";

type Row = {
  id: string;
  title: string;
  created_at: string;
  initial_context_json: string | null;
  model: string;
  jsonl_path: string;
  system_prompt: string | null;
};

const rowToSession = (r: Row): ChatSession => ({
  id: r.id,
  title: r.title,
  createdAt: r.created_at,
  initialContext: r.initial_context_json
    ? (JSON.parse(r.initial_context_json) as ChatViewContextSnapshot)
    : null,
  model: r.model,
  jsonlPath: r.jsonl_path,
  systemPrompt: r.system_prompt,
});

const rowToSummary = (r: Pick<Row, "id" | "title" | "created_at" | "model">): ChatSessionSummary => ({
  id: r.id,
  title: r.title,
  createdAt: r.created_at,
  model: r.model,
});

export const createSqliteChatSessionStore = ({
  db,
}: {
  db: Database.Database;
}): ChatSessionStore => {
  const listStmt = db.prepare<[], Pick<Row, "id" | "title" | "created_at" | "model">>(
    "SELECT id, title, created_at, model FROM chat_sessions ORDER BY created_at DESC",
  );
  const insertStmt = db.prepare<[
    string,
    string,
    string,
    string | null,
    string,
    string,
    string | null,
  ]>(
    `INSERT INTO chat_sessions
       (id, title, created_at, initial_context_json, model, jsonl_path, system_prompt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const getStmt = db.prepare<[string], Row>(
    "SELECT id, title, created_at, initial_context_json, model, jsonl_path, system_prompt FROM chat_sessions WHERE id = ?",
  );
  const updateTitleStmt = db.prepare<[string, string]>(
    "UPDATE chat_sessions SET title = ? WHERE id = ?",
  );
  const updateModelStmt = db.prepare<[string, string]>(
    "UPDATE chat_sessions SET model = ? WHERE id = ?",
  );
  const deleteStmt = db.prepare<[string]>("DELETE FROM chat_sessions WHERE id = ?");
  const listPathsStmt = db.prepare<[], { jsonl_path: string }>(
    "SELECT jsonl_path FROM chat_sessions",
  );

  return {
    async list() {
      return listStmt.all().map(rowToSummary);
    },
    async insert({
      id,
      title,
      createdAt,
      initialContext,
      model,
      jsonlPath,
      systemPrompt,
    }) {
      insertStmt.run(
        id,
        title,
        createdAt,
        initialContext ? JSON.stringify(initialContext) : null,
        model,
        jsonlPath,
        systemPrompt,
      );
    },
    async get(id) {
      const row = getStmt.get(id);
      return row ? rowToSession(row) : null;
    },
    async updateTitle(id, title) {
      updateTitleStmt.run(title, id);
    },
    async updateModel(id, model) {
      updateModelStmt.run(model, id);
    },
    async delete(id) {
      deleteStmt.run(id);
    },
    async listJsonlPaths() {
      return listPathsStmt.all().map((r) => r.jsonl_path);
    },
  };
};
