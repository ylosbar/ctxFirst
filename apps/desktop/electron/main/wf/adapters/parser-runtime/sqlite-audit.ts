/**
 * SQLite audit sink for code-mode parser executions. Stores hashes (not
 * payloads) so we can correlate runs across time without piling up
 * potentially sensitive content. Migration 10 owns the schema.
 */
import type Database from "better-sqlite3";
import type { ParserAuditSink } from "./quickjs";

export const createSqliteParserAuditSink = ({
  db,
}: {
  db: Database.Database;
}): ParserAuditSink => {
  const insert = db.prepare(
    `INSERT INTO wf_parser_runs (
       parser_id, parser_ver, mode, input_hash, output_hash, duration_ms, ok, error, created_at
     ) VALUES (
       @parser_id, @parser_ver, @mode, @input_hash, @output_hash, @duration_ms, @ok, @error, @created_at
     )`,
  );
  return {
    record(args) {
      insert.run({
        parser_id: args.parserId,
        parser_ver: args.parserVersion,
        mode: args.mode,
        input_hash: args.inputHash,
        output_hash: args.outputHash,
        duration_ms: args.durationMs,
        ok: args.ok ? 1 : 0,
        error: args.error ?? null,
        created_at: new Date().toISOString(),
      });
    },
  };
};
