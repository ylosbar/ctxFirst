import type Database from "better-sqlite3";
import type { RunLog, RunRecord } from "../../application/ports/outbound/run-log";
import type { StepExecId } from "../../domain/ids";

type Deps = { db: Database.Database };

type Row = {
  id: string;
  step_exec_id: string;
  provider: string;
  model: string;
  prompt_hash: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | null;
  latency_ms: number;
  output_ref: string | null;
  created_at: string;
};

const rowToRecord = (r: Row): RunRecord => ({
  id: r.id as RunRecord["id"],
  stepExecId: r.step_exec_id as RunRecord["stepExecId"],
  provider: r.provider,
  model: r.model,
  promptHash: r.prompt_hash,
  tokensIn: r.tokens_in,
  tokensOut: r.tokens_out,
  costUsd: r.cost_usd ?? undefined,
  latencyMs: r.latency_ms,
  outputRef: r.output_ref ?? undefined,
  createdAt: r.created_at,
});

export const createSqliteRunLog = ({ db }: Deps): RunLog => {
  const insert = db.prepare(
    `INSERT INTO wf_runs (id, step_exec_id, provider, model, prompt_hash,
                           tokens_in, tokens_out, cost_usd, latency_ms,
                           output_ref, created_at)
     VALUES (@id, @step_exec_id, @provider, @model, @prompt_hash,
             @tokens_in, @tokens_out, @cost_usd, @latency_ms,
             @output_ref, @created_at)`,
  );
  const selectByStepExec = db.prepare(
    `SELECT * FROM wf_runs WHERE step_exec_id = ? ORDER BY created_at ASC`,
  );

  return {
    async record(run: RunRecord): Promise<void> {
      insert.run({
        id: run.id,
        step_exec_id: run.stepExecId,
        provider: run.provider,
        model: run.model,
        prompt_hash: run.promptHash,
        tokens_in: run.tokensIn,
        tokens_out: run.tokensOut,
        cost_usd: run.costUsd ?? null,
        latency_ms: run.latencyMs,
        output_ref: run.outputRef ?? null,
        created_at: run.createdAt,
      });
    },
    async listByStepExec(id: StepExecId): Promise<ReadonlyArray<RunRecord>> {
      return (selectByStepExec.all(id) as Row[]).map(rowToRecord);
    },
  };
};
