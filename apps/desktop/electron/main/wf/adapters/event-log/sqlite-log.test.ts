/**
 * Round-trip guard for the event log's raw-JSON persistence. There is no Zod
 * schema between the `DomainEvent` union and the SQLite `payload_json` column —
 * events are `JSON.stringify`'d on append (everything except `eventId`/`at`/
 * `type`) and reassembled on read — so the only thing protecting new event
 * shapes is a test that drives them through that exact encode/decode. This locks
 * in the `template.invoke` Phase A additions (`sub-template-invoke.md`): the new
 * `InstanceStarted` fields (`depth`, `parent`, `templateSnapshots`) and the
 * `ChildInstanceSpawned` / `ChildInstanceCompleted` variants must survive the
 * JSON boundary.
 *
 * The real `better-sqlite3` binary is compiled against Electron's ABI and won't
 * load under plain-Node vitest, so we drive `createSqliteEventLog` against a
 * tiny in-memory fake `Database` that runs the adapter's own SQL-dispatch code
 * paths (same `JSON.stringify`/`JSON.parse` round-trip as production).
 */
import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../domain/events";
import {
  asArtifactId,
  asEventId,
  asStepExecId,
  asStepId,
  asTemplateId,
  asTemplateVersion,
  asWorkflowId,
} from "../../domain/ids";
import { project } from "../../domain/projection";
import type { WorkflowTemplate } from "../../domain/template";
import { createSqliteEventLog } from "./sqlite-log";

type EventRow = {
  id: number;
  event_id: string;
  instance_id: string;
  type: string;
  payload_json: string;
  occurred_at: string;
};

/**
 * Minimal in-memory stand-in for the `better-sqlite3` `Database` surface the
 * adapter uses: `prepare(sql)` → `{ run, all }`. Dispatches on the SQL text the
 * adapter passes (INSERT vs SELECT-all vs SELECT-by-instance), so the adapter's
 * actual serialization code runs unchanged.
 */
const createFakeDb = (): Database.Database => {
  const rows: EventRow[] = [];
  let autoId = 0;
  const prepare = (sql: string) => ({
    run: (params: Record<string, unknown>) => {
      if (/^\s*INSERT/i.test(sql)) {
        if (rows.some((r) => r.event_id === params.event_id)) return; // ON CONFLICT DO NOTHING
        rows.push({
          id: ++autoId,
          event_id: String(params.event_id),
          instance_id: String(params.instance_id),
          type: String(params.type),
          payload_json: String(params.payload_json),
          occurred_at: String(params.occurred_at),
        });
      }
    },
    all: (arg?: unknown) => {
      const ordered = [...rows].sort((a, b) => a.id - b.id);
      if (/WHERE\s+instance_id\s*=\s*\?/i.test(sql)) {
        return ordered.filter((r) => r.instance_id === arg);
      }
      return ordered;
    },
  });
  return { prepare } as unknown as Database.Database;
};

const PARENT = asWorkflowId("wf-parent");
const CHILD = asWorkflowId("wf-child");

const SUB_TPL: WorkflowTemplate = {
  id: asTemplateId("sub-tpl"),
  name: "Sub",
  description: "",
  version: asTemplateVersion("v1"),
  entryStep: asStepId("s0"),
  exitSteps: [asStepId("s0")],
  steps: [],
  transitions: [],
  variables: [{ name: "spec", kind: "Markdown", role: "input" }],
  status: "published",
};

describe("sqlite event log — Approach-A round-trip", () => {
  it("preserves the new InstanceStarted fields + child events verbatim", async () => {
    const log = createSqliteEventLog({ db: createFakeDb() });

    const events: DomainEvent[] = [
      {
        type: "InstanceStarted",
        eventId: asEventId("e1"),
        at: "2026-01-01T00:00:01.000Z",
        instanceId: PARENT,
        templateId: asTemplateId("root"),
        templateVersion: asTemplateVersion("v1"),
        seed: [asArtifactId("seed-1")],
        depth: 0,
        templateSnapshots: [{ ref: "sub-tpl@v1", template: SUB_TPL }],
      },
      {
        type: "StepStarted",
        eventId: asEventId("e2"),
        at: "2026-01-01T00:00:02.000Z",
        instanceId: PARENT,
        stepExecId: asStepExecId("exec-inv"),
        stepId: asStepId("inv"),
        kind: "template.invoke",
        inputArtifacts: [],
      },
      {
        type: "ChildInstanceSpawned",
        eventId: asEventId("e3"),
        at: "2026-01-01T00:00:03.000Z",
        instanceId: PARENT,
        stepExecId: asStepExecId("exec-inv"),
        childInstanceId: CHILD,
        childTemplateId: asTemplateId("sub-tpl"),
        childTemplateVersion: asTemplateVersion("v1"),
        seedBindings: [{ variableName: "spec", artifactId: asArtifactId("seed-1") }],
      },
      {
        type: "InstanceStarted",
        eventId: asEventId("e4"),
        at: "2026-01-01T00:00:04.000Z",
        instanceId: CHILD,
        templateId: asTemplateId("sub-tpl"),
        templateVersion: asTemplateVersion("v1"),
        seed: [asArtifactId("seed-1")],
        depth: 1,
        parent: { instanceId: PARENT, stepExecId: asStepExecId("exec-inv") },
      },
      {
        type: "ChildInstanceCompleted",
        eventId: asEventId("e5"),
        at: "2026-01-01T00:00:05.000Z",
        instanceId: PARENT,
        stepExecId: asStepExecId("exec-inv"),
        childInstanceId: CHILD,
        outcome: "completed",
        outputs: [{ variableName: "summary", artifactId: asArtifactId("art-out") }],
      },
    ];

    for (const evt of events) await log.append(evt);

    const back = await log.readAll();
    expect(back).toEqual(events);
  });

  it("rebuilds a child projection from the persisted stream", async () => {
    const log = createSqliteEventLog({ db: createFakeDb() });
    await log.append({
      type: "InstanceStarted",
      eventId: asEventId("c1"),
      at: "2026-01-01T00:00:01.000Z",
      instanceId: CHILD,
      templateId: asTemplateId("sub-tpl"),
      templateVersion: asTemplateVersion("v1"),
      seed: [],
      depth: 3,
      parent: { instanceId: PARENT, stepExecId: asStepExecId("exec-inv") },
    });

    const child = project(await log.readByInstance(CHILD))!;
    expect(child.depth).toBe(3);
    expect(child.parent).toEqual({
      instanceId: PARENT,
      stepExecId: asStepExecId("exec-inv"),
    });
  });
});
