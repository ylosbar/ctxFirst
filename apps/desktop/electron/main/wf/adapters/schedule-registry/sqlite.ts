import { Cron } from "croner";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ChannelContext } from "../../application/ports/outbound/channel-context";
import type { ScheduleRegistry } from "../../application/ports/outbound/schedule-registry";
import {
  asScheduleId,
  type ScheduleDraft,
  type ScheduleId,
  type ScheduleLastStatus,
  type ScheduleSeed,
  type WorkflowSchedule,
} from "../../domain/schedule";
import { bindChannel, channelScopeWhere } from "../_shared/channel-scope";

type Deps = { db: Database.Database; channels: ChannelContext };

type Row = {
  id: string;
  channel_id: string | null;
  name: string;
  template_ref: string;
  cron: string;
  timezone: string | null;
  seeds_json: string;
  cwd: string | null;
  enabled: number;
  last_run_at: string | null;
  last_instance_id: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const parseSeeds = (json: string): ReadonlyArray<ScheduleSeed> => {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ScheduleSeed =>
        !!e &&
        typeof (e as { kind?: unknown }).kind === "string" &&
        typeof (e as { content?: unknown }).content === "string",
    );
  } catch {
    return [];
  }
};

const rowToSchedule = (row: Row): WorkflowSchedule => ({
  id: asScheduleId(row.id),
  channelId: row.channel_id,
  name: row.name,
  templateRef: row.template_ref,
  cron: row.cron,
  ...(row.timezone ? { timezone: row.timezone } : {}),
  seeds: parseSeeds(row.seeds_json),
  ...(row.cwd ? { cwd: row.cwd } : {}),
  enabled: row.enabled === 1,
  ...(row.last_run_at ? { lastRunAt: row.last_run_at } : {}),
  ...(row.last_instance_id ? { lastInstanceId: row.last_instance_id } : {}),
  ...(row.last_status === "ok" || row.last_status === "error"
    ? { lastStatus: row.last_status as ScheduleLastStatus }
    : {}),
  ...(row.last_error ? { lastError: row.last_error } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const validateCron = (expr: string): void => {
  try {
    // Construct — croner throws synchronously on invalid pattern. We do not
    // schedule a callback so no timer is armed.
    new Cron(expr);
  } catch (err) {
    throw new Error(
      `Invalid cron expression "${expr}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

export const createSqliteScheduleRegistry = (
  { db, channels }: Deps,
): ScheduleRegistry => {
  const selectOne = db.prepare(
    `SELECT id, channel_id, name, template_ref, cron, timezone, seeds_json, cwd,
            enabled, last_run_at, last_instance_id, last_status, last_error,
            created_at, updated_at
       FROM wf_schedules WHERE id = ?`,
  );
  const selectScoped = db.prepare(
    `SELECT id, channel_id, name, template_ref, cron, timezone, seeds_json, cwd,
            enabled, last_run_at, last_instance_id, last_status, last_error,
            created_at, updated_at
       FROM wf_schedules
      WHERE ${channelScopeWhere}
      ORDER BY created_at DESC`,
  );
  const selectAllEnabled = db.prepare(
    `SELECT id, channel_id, name, template_ref, cron, timezone, seeds_json, cwd,
            enabled, last_run_at, last_instance_id, last_status, last_error,
            created_at, updated_at
       FROM wf_schedules
      WHERE enabled = 1
      ORDER BY created_at DESC`,
  );
  const insert = db.prepare(
    `INSERT INTO wf_schedules
       (id, channel_id, name, template_ref, cron, timezone, seeds_json, cwd,
        enabled, created_at, updated_at)
     VALUES (@id, @channel_id, @name, @template_ref, @cron, @timezone, @seeds_json,
             @cwd, @enabled, @now, @now)`,
  );
  const update = db.prepare(
    `UPDATE wf_schedules
        SET name         = @name,
            template_ref = @template_ref,
            cron         = @cron,
            timezone     = @timezone,
            seeds_json   = @seeds_json,
            cwd          = @cwd,
            enabled      = @enabled,
            updated_at   = @now
      WHERE id = @id`,
  );
  const updateEnabled = db.prepare(
    `UPDATE wf_schedules SET enabled = @enabled, updated_at = @now WHERE id = @id`,
  );
  const updateLastRun = db.prepare(
    `UPDATE wf_schedules
        SET last_run_at      = @last_run_at,
            last_instance_id = @last_instance_id,
            last_status      = @last_status,
            last_error       = @last_error,
            updated_at       = @now
      WHERE id = @id`,
  );
  const deleteOne = db.prepare(`DELETE FROM wf_schedules WHERE id = ?`);

  return {
    async list() {
      const rows = selectScoped.all(bindChannel(channels)) as Row[];
      return rows.map(rowToSchedule);
    },
    async listAllEnabled() {
      const rows = selectAllEnabled.all() as Row[];
      return rows.map(rowToSchedule);
    },
    async get(id) {
      const row = selectOne.get(id) as Row | undefined;
      return row ? rowToSchedule(row) : null;
    },
    async save(draft: ScheduleDraft) {
      validateCron(draft.cron);
      const now = new Date().toISOString();
      const id = draft.id ?? asScheduleId(randomUUID());
      const existing = draft.id
        ? (selectOne.get(draft.id) as Row | undefined)
        : undefined;
      const params = {
        id,
        name: draft.name,
        template_ref: draft.templateRef,
        cron: draft.cron,
        timezone: draft.timezone ?? null,
        seeds_json: JSON.stringify(draft.seeds ?? []),
        cwd: draft.cwd ?? null,
        enabled: draft.enabled ? 1 : 0,
        now,
      };
      if (existing) {
        update.run(params);
      } else {
        insert.run({ ...params, channel_id: channels.getActive() });
      }
      const row = selectOne.get(id) as Row;
      return rowToSchedule(row);
    },
    async setEnabled(id, enabled) {
      updateEnabled.run({
        id,
        enabled: enabled ? 1 : 0,
        now: new Date().toISOString(),
      });
    },
    async delete(id) {
      deleteOne.run(id);
    },
    async recordRun(id, run) {
      updateLastRun.run({
        id,
        last_run_at: run.at,
        last_instance_id: run.instanceId ?? null,
        last_status: run.status,
        last_error: run.error ?? null,
        now: new Date().toISOString(),
      });
    },
  };
};
