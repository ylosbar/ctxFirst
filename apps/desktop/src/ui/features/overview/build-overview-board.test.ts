import { describe, expect, it } from "vitest";
import type {
  InstanceStatus,
  InstanceSummaryView,
  ScheduleView,
} from "../../../domain/workflow/types";
import { buildOverviewBoard } from "./build-overview-board";
import type { OverviewColumnId } from "./overview-types";

const mkRun = (
  id: string,
  status: InstanceStatus,
  updatedAt: string,
  templateId = "scrape",
  templateVersion = "v1",
): InstanceSummaryView => ({
  id,
  templateId,
  templateVersion,
  status,
  createdAt: updatedAt,
  updatedAt,
  stepCount: 0,
  channelId: "ch1",
});

const mkSchedule = (
  id: string,
  over: Partial<ScheduleView> = {},
): ScheduleView => ({
  id,
  channelId: "ch1",
  name: `schedule-${id}`,
  templateRef: "scrape@v1",
  cron: "0 9 * * 1-5",
  seeds: [],
  enabled: true,
  nextRunAt: "2026-06-01T09:00:00Z",
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
  ...over,
});

const defaults = {
  instances: [] as ReadonlyArray<InstanceSummaryView>,
  schedules: [] as ReadonlyArray<ScheduleView>,
  templatesByRef: new Map<string, string>(),
  templateFilter: new Set<string>(),
  statusFilter: new Set<OverviewColumnId>(),
  query: "",
};

const colById = (
  out: ReturnType<typeof buildOverviewBoard>,
  id: OverviewColumnId,
) => out.find((c) => c.id === id);

describe("buildOverviewBoard", () => {
  it("returns the 5 columns in fixed order even when empty", () => {
    const out = buildOverviewBoard(defaults);
    expect(out.map((c) => c.id)).toEqual([
      "scheduled",
      "running",
      "awaitingHuman",
      "error",
      "completed",
    ]);
    expect(out.every((c) => c.cards.length === 0)).toBe(true);
  });

  it("maps run statuses to their columns (failed → error)", () => {
    const out = buildOverviewBoard({
      ...defaults,
      instances: [
        mkRun("r", "running", "2026-05-27T10:00:00Z"),
        mkRun("a", "awaitingHuman", "2026-05-27T10:00:00Z"),
        mkRun("c", "completed", "2026-05-27T10:00:00Z"),
        mkRun("f", "failed", "2026-05-27T10:00:00Z"),
      ],
    });
    expect(colById(out, "running")?.cards).toHaveLength(1);
    expect(colById(out, "awaitingHuman")?.cards).toHaveLength(1);
    expect(colById(out, "completed")?.cards).toHaveLength(1);
    expect(colById(out, "error")?.cards).toHaveLength(1);
  });

  it("sorts runs by updatedAt desc within a column", () => {
    const out = buildOverviewBoard({
      ...defaults,
      instances: [
        mkRun("a", "completed", "2026-05-27T10:00:00Z"),
        mkRun("b", "completed", "2026-05-27T12:00:00Z"),
        mkRun("c", "completed", "2026-05-27T11:00:00Z"),
      ],
    });
    expect(
      colById(out, "completed")?.cards.map((card) =>
        card.kind === "run" ? card.instance.id : null,
      ),
    ).toEqual(["b", "c", "a"]);
  });

  it("puts enabled schedules with nextRunAt in `scheduled`, sorted by nextRunAt asc", () => {
    const out = buildOverviewBoard({
      ...defaults,
      schedules: [
        mkSchedule("late", { nextRunAt: "2026-06-02T09:00:00Z" }),
        mkSchedule("soon", { nextRunAt: "2026-06-01T09:00:00Z" }),
      ],
    });
    expect(
      colById(out, "scheduled")?.cards.map((card) =>
        card.kind === "schedule" ? card.schedule.id : null,
      ),
    ).toEqual(["soon", "late"]);
  });

  it("excludes disabled schedules and schedules without nextRunAt", () => {
    const out = buildOverviewBoard({
      ...defaults,
      schedules: [
        mkSchedule("disabled", { enabled: false }),
        mkSchedule("nonext", { nextRunAt: null }),
        mkSchedule("ok"),
      ],
    });
    const ids = colById(out, "scheduled")?.cards.map((card) =>
      card.kind === "schedule" ? card.schedule.id : null,
    );
    expect(ids).toEqual(["ok"]);
  });

  it("resolves the template name from templatesByRef (null when unknown)", () => {
    const out = buildOverviewBoard({
      ...defaults,
      instances: [
        mkRun("known", "running", "2026-05-27T10:00:00Z", "scrape", "v1"),
        mkRun("orphan", "running", "2026-05-27T11:00:00Z", "gone", "v9"),
      ],
      templatesByRef: new Map([["scrape@v1", "Scraper"]]),
    });
    const cards = colById(out, "running")?.cards ?? [];
    const known = cards.find(
      (c) => c.kind === "run" && c.instance.id === "known",
    );
    const orphan = cards.find(
      (c) => c.kind === "run" && c.instance.id === "orphan",
    );
    expect(known?.templateName).toBe("Scraper");
    expect(orphan?.templateName).toBeNull();
  });

  it("statusFilter hides unselected columns", () => {
    const out = buildOverviewBoard({
      ...defaults,
      instances: [mkRun("r", "running", "2026-05-27T10:00:00Z")],
      statusFilter: new Set<OverviewColumnId>(["running", "completed"]),
    });
    expect(out.map((c) => c.id)).toEqual(["running", "completed"]);
  });

  it("templateFilter keeps only matching refs (runs + schedules)", () => {
    const out = buildOverviewBoard({
      ...defaults,
      instances: [
        mkRun("a", "running", "2026-05-27T10:00:00Z", "foo", "v1"),
        mkRun("b", "running", "2026-05-27T10:00:00Z", "bar", "v1"),
      ],
      schedules: [
        mkSchedule("s1", { templateRef: "foo@v1" }),
        mkSchedule("s2", { templateRef: "bar@v1" }),
      ],
      templateFilter: new Set(["foo@v1"]),
    });
    const running = colById(out, "running")?.cards ?? [];
    expect(
      running.map((c) => (c.kind === "run" ? c.instance.id : null)),
    ).toEqual(["a"]);
    const scheduled = colById(out, "scheduled")?.cards ?? [];
    expect(
      scheduled.map((c) => (c.kind === "schedule" ? c.schedule.id : null)),
    ).toEqual(["s1"]);
  });

  it("query matches template name and short id for runs", () => {
    const out = buildOverviewBoard({
      ...defaults,
      instances: [
        mkRun("abcdef0123", "running", "2026-05-27T10:00:00Z", "foo", "v1"),
        mkRun("zzz", "running", "2026-05-27T10:00:00Z", "bar", "v1"),
      ],
      templatesByRef: new Map([
        ["foo@v1", "Scraper"],
        ["bar@v1", "Mailer"],
      ]),
      query: "scra",
    });
    const running = colById(out, "running")?.cards ?? [];
    expect(
      running.map((c) => (c.kind === "run" ? c.instance.id : null)),
    ).toEqual(["abcdef0123"]);
  });

  it("query matches schedule name", () => {
    const out = buildOverviewBoard({
      ...defaults,
      schedules: [
        mkSchedule("s1", { name: "Daily digest" }),
        mkSchedule("s2", { name: "Weekly report" }),
      ],
      query: "digest",
    });
    const scheduled = colById(out, "scheduled")?.cards ?? [];
    expect(
      scheduled.map((c) => (c.kind === "schedule" ? c.schedule.id : null)),
    ).toEqual(["s1"]);
  });

  it("caps the completed column at 50 and reports the overflow", () => {
    const instances = Array.from({ length: 60 }, (_, i) =>
      mkRun(
        `c${String(i).padStart(2, "0")}`,
        "completed",
        `2026-05-27T${String(i % 24).padStart(2, "0")}:00:00Z`,
      ),
    );
    const out = buildOverviewBoard({ ...defaults, instances });
    const completed = colById(out, "completed");
    expect(completed?.cards).toHaveLength(50);
    expect(completed?.overflowCount).toBe(10);
  });
});
