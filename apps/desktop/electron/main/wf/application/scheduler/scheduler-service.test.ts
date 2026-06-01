import { describe, expect, it, vi } from "vitest";
import { createSchedulerService } from "./scheduler-service";
import type { ScheduleRegistry } from "../ports/outbound/schedule-registry";
import type { LoggerPort } from "../ports/outbound/logger";
import {
  asScheduleId,
  type WorkflowSchedule,
} from "../../domain/schedule";
import { createFakeClock } from "../../__tests__/fixtures/fake-clock";
import { asWorkflowId } from "../../domain/ids";

const silentLogger: LoggerPort = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const makeSchedule = (overrides: Partial<WorkflowSchedule> = {}): WorkflowSchedule => ({
  id: asScheduleId("sch-1"),
  channelId: "ctxfirst",
  name: "Daily audit",
  templateRef: "tpl@1",
  cron: "0 9 * * *",
  seeds: [{ kind: "Markdown", content: "hello" }],
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

type StubRegistry = ScheduleRegistry & {
  recordRunCalls: Array<{ id: string; status: string; instanceId?: string }>;
  schedules: WorkflowSchedule[];
};

const makeRegistry = (schedules: WorkflowSchedule[]): StubRegistry => {
  const recordRunCalls: Array<{
    id: string;
    status: string;
    instanceId?: string;
  }> = [];
  return {
    schedules,
    recordRunCalls,
    async list() {
      return schedules;
    },
    async listAllEnabled() {
      return schedules.filter((s) => s.enabled);
    },
    async get(id) {
      return schedules.find((s) => s.id === id) ?? null;
    },
    async save() {
      throw new Error("not used");
    },
    async setEnabled() {
      // no-op
    },
    async delete() {
      // no-op
    },
    async recordRun(id, run) {
      recordRunCalls.push({
        id,
        status: run.status,
        ...(run.instanceId ? { instanceId: run.instanceId } : {}),
      });
      const idx = schedules.findIndex((s) => s.id === id);
      if (idx >= 0) {
        schedules[idx] = {
          ...schedules[idx],
          lastRunAt: run.at,
          lastStatus: run.status,
          ...(run.instanceId ? { lastInstanceId: run.instanceId } : {}),
        };
      }
    },
  };
};

describe("scheduler-service · fire()", () => {
  it("calls startInstance with the schedule's seeds, cwd and channel, then records ok", async () => {
    const clock = createFakeClock("2026-05-27T12:00:00.000Z");
    const schedule = makeSchedule({
      cwd: "/tmp/work",
      channelId: "channel-B",
    });
    const registry = makeRegistry([schedule]);
    const startInstance = vi
      .fn()
      .mockResolvedValue({ instanceId: asWorkflowId("wf-1") });
    const scheduler = createSchedulerService({
      registry,
      startInstance,
      clock,
      logger: silentLogger,
    });

    // Use reload (no catch-up) just to arm; then fire manually via a private
    // path is awkward — instead, force a catch-up by setting createdAt in the
    // past and having no lastRunAt, then call start().
    schedule.createdAt = "2026-05-27T00:00:00.000Z"; // before 9am occurrence
    await scheduler.start();
    scheduler.stop();

    expect(startInstance).toHaveBeenCalledTimes(1);
    expect(startInstance).toHaveBeenCalledWith({
      templateRef: "tpl@1",
      seeds: [{ kind: "Markdown", content: "hello" }],
      cwd: "/tmp/work",
      channelId: "channel-B",
    });
    expect(registry.recordRunCalls).toEqual([
      { id: "sch-1", status: "ok", instanceId: "wf-1" },
    ]);
  });

  it("records error and keeps job armed when startInstance throws", async () => {
    const clock = createFakeClock("2026-05-27T12:00:00.000Z");
    const schedule = makeSchedule({
      createdAt: "2026-05-27T00:00:00.000Z",
    });
    const registry = makeRegistry([schedule]);
    const startInstance = vi
      .fn()
      .mockRejectedValue(new Error("template not found"));
    const scheduler = createSchedulerService({
      registry,
      startInstance,
      clock,
      logger: silentLogger,
    });

    await scheduler.start();
    scheduler.stop();

    expect(startInstance).toHaveBeenCalledTimes(1);
    expect(registry.recordRunCalls).toEqual([
      { id: "sch-1", status: "error" },
    ]);
  });
});

describe("scheduler-service · catch-up at boot", () => {
  it("fires exactly one run when a tick was due since lastRunAt", async () => {
    // Schedule fires hourly (0 * * * *). Now = 12:00. Last run was at 09:00.
    // 3 ticks were due (10/11/12) — collapse to exactly 1 fire().
    const clock = createFakeClock("2026-05-27T12:00:00.000Z");
    const schedule = makeSchedule({
      cron: "0 * * * *",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastRunAt: "2026-05-27T09:00:00.000Z",
    });
    const registry = makeRegistry([schedule]);
    const startInstance = vi
      .fn()
      .mockResolvedValue({ instanceId: asWorkflowId("wf-catchup") });
    const scheduler = createSchedulerService({
      registry,
      startInstance,
      clock,
      logger: silentLogger,
    });

    await scheduler.start();
    scheduler.stop();

    expect(startInstance).toHaveBeenCalledTimes(1);
  });

  it("does NOT catch up when no tick is due since lastRunAt", async () => {
    // Last run 10 minutes ago, hourly cron — no occurrence between then and now.
    const clock = createFakeClock("2026-05-27T09:10:00.000Z");
    const schedule = makeSchedule({
      cron: "0 * * * *",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastRunAt: "2026-05-27T09:00:00.000Z",
    });
    const registry = makeRegistry([schedule]);
    const startInstance = vi.fn();
    const scheduler = createSchedulerService({
      registry,
      startInstance,
      clock,
      logger: silentLogger,
    });

    await scheduler.start();
    scheduler.stop();

    expect(startInstance).not.toHaveBeenCalled();
  });

  it("uses createdAt as lower bound when never fired", async () => {
    // Created at 06:00, no lastRunAt, daily cron at 09:00, now = 12:00 →
    // catch-up.
    const clock = createFakeClock("2026-05-27T12:00:00.000Z");
    const schedule = makeSchedule({
      cron: "0 9 * * *",
      createdAt: "2026-05-27T06:00:00.000Z",
    });
    const registry = makeRegistry([schedule]);
    const startInstance = vi
      .fn()
      .mockResolvedValue({ instanceId: asWorkflowId("wf-first") });
    const scheduler = createSchedulerService({
      registry,
      startInstance,
      clock,
      logger: silentLogger,
    });

    await scheduler.start();
    scheduler.stop();

    expect(startInstance).toHaveBeenCalledTimes(1);
  });

  it("does NOT catch up when created after the most recent occurrence", async () => {
    // Created at 11:00 today, daily cron 09:00, now 12:00 — last occurrence
    // (09:00 today) is BEFORE createdAt → no rattrapage.
    const clock = createFakeClock("2026-05-27T12:00:00.000Z");
    const schedule = makeSchedule({
      cron: "0 9 * * *",
      createdAt: "2026-05-27T11:00:00.000Z",
    });
    const registry = makeRegistry([schedule]);
    const startInstance = vi.fn();
    const scheduler = createSchedulerService({
      registry,
      startInstance,
      clock,
      logger: silentLogger,
    });

    await scheduler.start();
    scheduler.stop();

    expect(startInstance).not.toHaveBeenCalled();
  });
});

describe("scheduler-service · reload()", () => {
  it("never triggers catch-up", async () => {
    const clock = createFakeClock("2026-05-27T12:00:00.000Z");
    // Schedule with an obvious pending catch-up.
    const schedule = makeSchedule({
      cron: "0 * * * *",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastRunAt: "2026-05-27T09:00:00.000Z",
    });
    const registry = makeRegistry([schedule]);
    const startInstance = vi.fn();
    const scheduler = createSchedulerService({
      registry,
      startInstance,
      clock,
      logger: silentLogger,
    });

    await scheduler.reload();
    scheduler.stop();

    expect(startInstance).not.toHaveBeenCalled();
  });
});
