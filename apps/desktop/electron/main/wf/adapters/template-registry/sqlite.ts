import type Database from "better-sqlite3";
import type { TemplateLayout } from "@shared/wf/layout";
import type { ChannelContext } from "../../application/ports/outbound/channel-context";
import type { TemplateRegistry } from "../../application/ports/outbound/template-registry";
import { DEFAULT_CHANNEL_ID } from "../../domain/channel";
import {
  asStepId,
  asTemplateId,
  asTemplateVersion,
  type TemplateId,
  type TemplateVersion,
} from "../../domain/ids";
import {
  validateTemplate,
  type StepDef,
  type TemplateVariable,
  type Transition,
  type WorkflowTemplate,
} from "../../domain/template";
import { migrateLegacyVariableSteps } from "../../application/use-cases/migrate-legacy-variable-steps";
import {
  migrateActiveParsersToTransformRun,
  PARSER_AS_OPTION_SEED_KEY,
  type ParserAsOptionSeedEntry,
} from "../../application/use-cases/migrate-active-parsers-to-transform-run";
import { migrateShellExecReportPort } from "../../application/use-cases/migrate-shell-exec-report-port";
import { BUILTIN_TEMPLATE_SEEDS } from "./seeds";
import { bindChannel, channelScopeWhere } from "../_shared/channel-scope";

type Deps = { db: Database.Database; channels: ChannelContext };

type Row = {
  id: string;
  version: string;
  name: string;
  description: string;
  entry_step: string;
  exit_steps: string;
  steps: string;
  transitions: string;
  variables: string | null;
  status: string;
};

const rowToTemplate = (
  row: Row,
  parserAsOptionSeed: ReadonlyArray<ParserAsOptionSeedEntry>,
): WorkflowTemplate => {
  const exitSteps = (JSON.parse(row.exit_steps) as string[]).map((s) => asStepId(s));
  const steps = JSON.parse(row.steps) as ReadonlyArray<StepDef>;
  const transitions = JSON.parse(row.transitions) as ReadonlyArray<Transition>;
  const variables = row.variables
    ? (JSON.parse(row.variables) as ReadonlyArray<TemplateVariable>)
    : [];
  const raw: WorkflowTemplate = {
    id: asTemplateId(row.id),
    version: asTemplateVersion(row.version),
    name: row.name,
    description: row.description ?? "",
    entryStep: asStepId(row.entry_step),
    exitSteps,
    steps,
    transitions,
    variables,
    status: row.status === "draft" ? "draft" : "published",
  };
  const { template: afterLegacy, skipped } = migrateLegacyVariableSteps(raw);
  for (const skip of skipped) {
    console.warn(
      `[wf:templates] template-migration-skipped ${afterLegacy.id}@${afterLegacy.version}: ${skip.message}`,
    );
  }
  const { template: afterShellExec } = migrateShellExecReportPort(afterLegacy);
  const { template: tpl, skipped: parserSkipped } =
    migrateActiveParsersToTransformRun(afterShellExec, parserAsOptionSeed);
  for (const skip of parserSkipped) {
    console.warn(
      `[wf:templates] parser-as-option-migration-skipped ${tpl.id}@${tpl.version}: ${skip.message}`,
    );
  }
  validateTemplate(tpl);
  return tpl;
};

const readParserAsOptionSeed = (
  db: Database.Database,
): ReadonlyArray<ParserAsOptionSeedEntry> => {
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(PARSER_AS_OPTION_SEED_KEY) as { value: string } | undefined;
    if (!row) return [];
    const parsed = JSON.parse(row.value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ParserAsOptionSeedEntry =>
        !!e &&
        typeof (e as { kind?: unknown }).kind === "string" &&
        typeof (e as { parserId?: unknown }).parserId === "string" &&
        typeof (e as { parserVersion?: unknown }).parserVersion === "string",
    );
  } catch {
    return [];
  }
};

const parseRef = (ref: string): { id: TemplateId; version: TemplateVersion } => {
  const [idPart, versionPart] = ref.split("@");
  if (!idPart || !versionPart) throw new Error(`invalid template ref: ${ref}`);
  return { id: asTemplateId(idPart), version: asTemplateVersion(versionPart) };
};

export const createSqliteTemplateRegistry = (
  { db, channels }: Deps,
): TemplateRegistry => {
  // Snapshot of the parser-as-option seed dropped by SQL migration v18.
  // Loaded once at construction time — the table is gone after the migration,
  // and the seed is invariant for the engine's lifetime.
  const parserAsOptionSeed = readParserAsOptionSeed(db);
  // `resolve` stays channel-agnostic — same rationale as in skill-registry:
  // pre-existing instances may pin a template that has since moved.
  const selectOne = db.prepare(
    `SELECT id, version, name, description, entry_step, exit_steps, steps, transitions, variables, status
     FROM wf_templates WHERE id = ? AND version = ?`,
  );
  const selectAll = db.prepare(
    `SELECT id, version, name, description, entry_step, exit_steps, steps, transitions, variables, status
       FROM wf_templates
      WHERE ${channelScopeWhere}
      ORDER BY created_at DESC, version DESC`,
  );
  const upsert = db.prepare(
    `INSERT INTO wf_templates
       (id, version, name, description, entry_step, exit_steps, steps, transitions, variables, status, channel_id, created_at, updated_at)
     VALUES (@id, @version, @name, @description, @entry_step, @exit_steps, @steps, @transitions, @variables, @status, @channel_id, @now, @now)
     ON CONFLICT(id, version) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       entry_step = excluded.entry_step,
       exit_steps = excluded.exit_steps,
       steps = excluded.steps,
       transitions = excluded.transitions,
       variables = excluded.variables,
       status = excluded.status,
       updated_at = excluded.updated_at`,
  );
  const updateName = db.prepare(
    `UPDATE wf_templates
       SET name = @name, updated_at = @now
     WHERE id = @id AND version = @version`,
  );
  const selectLayout = db.prepare(
    `SELECT layout FROM wf_templates WHERE id = ? AND version = ?`,
  );
  const updateLayout = db.prepare(
    `UPDATE wf_templates SET layout = @layout, updated_at = @now
       WHERE id = @id AND version = @version`,
  );

  return {
    async resolve(id: TemplateId, version: TemplateVersion): Promise<WorkflowTemplate> {
      const row = selectOne.get(id, version) as Row | undefined;
      if (!row) throw new Error(`template not found: ${id}@${version}`);
      return rowToTemplate(row, parserAsOptionSeed);
    },
    async resolveRef(ref: string): Promise<WorkflowTemplate> {
      const { id, version } = parseRef(ref);
      return this.resolve(id, version);
    },
    async list(): Promise<ReadonlyArray<WorkflowTemplate>> {
      const rows = selectAll.all(bindChannel(channels)) as Row[];
      return rows.map((row) => rowToTemplate(row, parserAsOptionSeed));
    },
    async save(tpl: WorkflowTemplate): Promise<void> {
      upsert.run({
        id: tpl.id,
        version: tpl.version,
        name: tpl.name,
        description: tpl.description,
        entry_step: tpl.entryStep,
        exit_steps: JSON.stringify(tpl.exitSteps),
        steps: JSON.stringify(tpl.steps),
        transitions: JSON.stringify(tpl.transitions),
        variables: JSON.stringify(tpl.variables ?? []),
        status: tpl.status,
        channel_id: channels.getActive(),
        now: new Date().toISOString(),
      });
    },
    async rename(id: TemplateId, version: TemplateVersion, newName: string): Promise<void> {
      const result = updateName.run({
        id,
        version,
        name: newName,
        now: new Date().toISOString(),
      });
      if (result.changes === 0) {
        throw new Error(`template not found: ${id}@${version}`);
      }
    },
    async getLayout(
      id: TemplateId,
      version: TemplateVersion,
    ): Promise<TemplateLayout | null> {
      const row = selectLayout.get(id, version) as { layout: string | null } | undefined;
      if (!row || row.layout == null) return null;
      return JSON.parse(row.layout) as TemplateLayout;
    },
    async saveLayout(
      id: TemplateId,
      version: TemplateVersion,
      layout: TemplateLayout,
    ): Promise<void> {
      const result = updateLayout.run({
        id,
        version,
        layout: JSON.stringify(layout),
        now: new Date().toISOString(),
      });
      if (result.changes === 0) {
        throw new Error(`template not found: ${id}@${version}`);
      }
    },
  };
};

/**
 * Inserts the built-in templates that aren't already present. Idempotent at
 * boot via `ON CONFLICT(id, version) DO NOTHING` — an existing row (possibly
 * user-edited) is left untouched, but new builtins added in later versions of
 * the app are inserted on the next boot.
 */
export const seedBuiltinTemplates = (db: Database.Database): void => {
  // Built-in templates land in the default channel (see seedBuiltinSkills).
  const insert = db.prepare(
    `INSERT INTO wf_templates
       (id, version, name, description, entry_step, exit_steps, steps, transitions, variables, status, channel_id, created_at, updated_at)
     VALUES (@id, @version, @name, @description, @entry_step, @exit_steps, @steps, @transitions, @variables, @status, @channel_id, @now, @now)
     ON CONFLICT(id, version) DO NOTHING`,
  );
  const now = new Date().toISOString();
  const run = db.transaction((tpls: ReadonlyArray<WorkflowTemplate>) => {
    for (const t of tpls) {
      insert.run({
        id: t.id,
        version: t.version,
        name: t.name,
        description: t.description,
        entry_step: t.entryStep,
        exit_steps: JSON.stringify(t.exitSteps),
        steps: JSON.stringify(t.steps),
        transitions: JSON.stringify(t.transitions),
        variables: JSON.stringify(t.variables ?? []),
        status: t.status,
        channel_id: DEFAULT_CHANNEL_ID,
        now,
      });
    }
  });
  run(BUILTIN_TEMPLATE_SEEDS);
};
