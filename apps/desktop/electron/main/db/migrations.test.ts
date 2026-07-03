/**
 * Guard for the v32 migration (backend-agnostic agent nodes). The real
 * `better-sqlite3` binary is compiled against Electron's ABI and won't load
 * under plain-Node vitest, so — like the event-log adapter test — we drive the
 * migration's imperative `run` hook against a tiny in-memory stand-in for the
 * `Database` surface it touches: `prepare(sql)` → `{ all, run }`, dispatching on
 * whether the SQL is the `SELECT … FROM wf_templates` scan or the
 * `UPDATE wf_templates SET steps = ? WHERE rowid = ?` write.
 */
import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrations } from "./migrations";

type TemplateRow = {
  rowid: number;
  id: string;
  version: string;
  steps: string;
  transitions: string;
  updated_at: string;
};

type EventRow = { id: number; payload_json: string };

const LEGACY_TOKENS = [
  '"kind":"claude_code.invoke"',
  '"kind":"codex.invoke"',
  '"kind":"claude_code.judge"',
];

/** Faithful-enough fake for the two statements v32's `run` prepares. */
const createFakeDb = (templates: TemplateRow[], events: EventRow[]) => {
  const prepare = (sql: string) => ({
    all: () => {
      if (/SELECT[\s\S]*FROM wf_templates/i.test(sql)) {
        return templates
          .filter((t) => LEGACY_TOKENS.some((tok) => t.steps.includes(tok)))
          .map((t) => ({ rowid: t.rowid, steps: t.steps }));
      }
      throw new Error(`unexpected SELECT in test: ${sql}`);
    },
    run: (...args: unknown[]) => {
      if (/UPDATE wf_templates SET steps = \? WHERE rowid = \?/i.test(sql)) {
        const [steps, rowid] = args as [string, number];
        const row = templates.find((t) => t.rowid === rowid);
        if (row) row.steps = steps; // updated_at deliberately untouched
        return;
      }
      throw new Error(`unexpected UPDATE in test: ${sql}`);
    },
  });
  // `events` is here only to assert the migration never queries/mutates it.
  void events;
  return { prepare } as unknown as Database.Database;
};

const v32 = migrations.find((m) => m.version === 32);

const runV32 = (templates: TemplateRow[], events: EventRow[] = []): void => {
  if (!v32?.run) throw new Error("v32 migration or its run hook is missing");
  v32.run(createFakeDb(templates, events));
};

const stepsOf = (row: TemplateRow) =>
  JSON.parse(row.steps) as Array<Record<string, unknown>>;

const makeTemplate = (
  overrides: Omit<Partial<TemplateRow>, "steps"> & { steps: unknown },
): TemplateRow => ({
  rowid: 1,
  id: "tpl",
  version: "v1",
  transitions: "[]",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
  steps: JSON.stringify(overrides.steps),
});

describe("migration v32 — legacy agent kinds → agent.*", () => {
  it("rewrites claude_code.invoke → agent.invoke with provider claude-code, model preserved", () => {
    const tpl = makeTemplate({
      steps: [
        {
          id: "s1",
          name: "gen",
          kind: "claude_code.invoke",
          actorRole: "LLMAgent",
          config: { model: "claude-opus-4-7", maxTokens: 8000, outputKind: "Markdown" },
        },
      ],
    });
    runV32([tpl]);
    const step = stepsOf(tpl)[0];
    expect(step.kind).toBe("agent.invoke");
    expect(step.config).toMatchObject({
      provider: "claude-code",
      model: "claude-opus-4-7",
      maxTokens: 8000,
      outputKind: "Markdown",
    });
  });

  it("rewrites codex.invoke → agent.invoke with provider codex, model gpt-5-codex preserved", () => {
    const tpl = makeTemplate({
      steps: [
        {
          id: "s1",
          name: "gen",
          kind: "codex.invoke",
          actorRole: "LLMAgent",
          config: { model: "gpt-5-codex", outputKind: "Markdown" },
        },
      ],
    });
    runV32([tpl]);
    const step = stepsOf(tpl)[0];
    expect(step.kind).toBe("agent.invoke");
    expect(step.config).toMatchObject({ provider: "codex", model: "gpt-5-codex" });
  });

  it("rewrites claude_code.judge → agent.judge with provider claude-code", () => {
    const tpl = makeTemplate({
      steps: [
        {
          id: "s1",
          name: "judge",
          kind: "claude_code.judge",
          actorRole: "LLMAgent",
          config: { judgePrompt: "", maxAttempts: 3 },
        },
      ],
    });
    runV32([tpl]);
    const step = stepsOf(tpl)[0];
    expect(step.kind).toBe("agent.judge");
    expect(step.config).toMatchObject({
      provider: "claude-code",
      judgePrompt: "",
      maxAttempts: 3,
    });
  });

  it("leaves non-legacy steps, transitions and updated_at unchanged", () => {
    const originalUpdatedAt = "2020-05-05T12:00:00.000Z";
    const tpl = makeTemplate({
      updated_at: originalUpdatedAt,
      transitions: '[{"from":"s1","to":"s2"}]',
      steps: [
        { id: "s0", name: "in", kind: "user.input", config: { outputKind: "Markdown" } },
        {
          id: "s1",
          name: "gen",
          kind: "claude_code.invoke",
          config: { outputKind: "Markdown" },
        },
      ],
    });
    runV32([tpl]);
    const [userInput, invoke] = stepsOf(tpl);
    // Untouched kind stays as-is (no provider injected).
    expect(userInput.kind).toBe("user.input");
    expect(userInput.config).toEqual({ outputKind: "Markdown" });
    // Migrated one changes.
    expect(invoke.kind).toBe("agent.invoke");
    // Metadata columns untouched.
    expect(tpl.updated_at).toBe(originalUpdatedAt);
    expect(tpl.transitions).toBe('[{"from":"s1","to":"s2"}]');
  });

  it("does not rewrite a template without any legacy kind", () => {
    const tpl = makeTemplate({
      steps: [{ id: "s0", name: "in", kind: "user.input", config: {} }],
    });
    const before = tpl.steps;
    runV32([tpl]);
    expect(tpl.steps).toBe(before);
  });

  it("covers every version of a template (composite (id, version) PK)", () => {
    const v1 = makeTemplate({
      rowid: 1,
      version: "v1",
      steps: [{ id: "s1", kind: "codex.invoke", config: {} }],
    });
    const v2 = makeTemplate({
      rowid: 2,
      version: "v2",
      steps: [{ id: "s1", kind: "codex.invoke", config: {} }],
    });
    runV32([v1, v2]);
    expect(stepsOf(v1)[0].kind).toBe("agent.invoke");
    expect(stepsOf(v2)[0].kind).toBe("agent.invoke");
  });

  it("is idempotent — a second pass is a no-op (WHERE … LIKE ignores clean rows)", () => {
    const tpl = makeTemplate({
      steps: [{ id: "s1", kind: "claude_code.invoke", config: { model: "claude-opus-4-7" } }],
    });
    runV32([tpl]);
    const afterFirst = tpl.steps;
    runV32([tpl]);
    expect(tpl.steps).toBe(afterFirst);
    const step = stepsOf(tpl)[0];
    expect(step.kind).toBe("agent.invoke");
    // provider injected exactly once (not duplicated / re-shuffled).
    expect(step.config).toEqual({ provider: "claude-code", model: "claude-opus-4-7" });
  });

  it("injects config.provider even when a legacy step has no config", () => {
    const tpl = makeTemplate({
      steps: [{ id: "s1", kind: "claude_code.invoke" }],
    });
    runV32([tpl]);
    expect(stepsOf(tpl)[0].config).toEqual({ provider: "claude-code" });
  });

  it("never touches the immutable event journal", () => {
    const tpl = makeTemplate({
      steps: [{ id: "s1", kind: "claude_code.invoke", config: {} }],
    });
    const events: EventRow[] = [
      { id: 1, payload_json: '{"kind":"claude_code.invoke"}' },
    ];
    const snapshot = JSON.stringify(events);
    runV32([tpl], events);
    // The migration's SQL only ever addresses wf_templates; events are inert.
    expect(JSON.stringify(events)).toBe(snapshot);
  });
});
