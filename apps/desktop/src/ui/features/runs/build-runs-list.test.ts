import { describe, expect, it } from "vitest";
import type {
  InstanceStatus,
  InstanceSummaryView,
} from "../../../domain/workflow/types";
import { buildRunsList } from "./build-runs-list";

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

describe("buildRunsList", () => {
  it("returns [] when there are no instances", () => {
    const out = buildRunsList({
      instances: [],
      pinnedIds: new Set(),
      statusFilter: new Set(),
      groupMode: "status",
    });
    expect(out).toEqual([]);
  });

  it("sorts items by updatedAt desc within a group", () => {
    const a = mkRun("a", "completed", "2026-05-27T10:00:00Z");
    const b = mkRun("b", "completed", "2026-05-27T12:00:00Z");
    const c = mkRun("c", "completed", "2026-05-27T11:00:00Z");
    const out = buildRunsList({
      instances: [a, b, c],
      pinnedIds: new Set(),
      statusFilter: new Set(),
      groupMode: "status",
    });
    expect(out).toHaveLength(1);
    expect(out[0].items.map((i) => i.instance.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps only statuses present in statusFilter when non-empty", () => {
    const r = mkRun("r", "running", "2026-05-27T10:00:00Z");
    const a = mkRun("a", "awaitingHuman", "2026-05-27T10:00:00Z");
    const c = mkRun("c", "completed", "2026-05-27T10:00:00Z");
    const out = buildRunsList({
      instances: [r, a, c],
      pinnedIds: new Set(),
      statusFilter: new Set<InstanceStatus>(["running", "completed"]),
      groupMode: "status",
    });
    const ids = out.flatMap((g) => g.items.map((i) => i.instance.id));
    expect(ids.sort()).toEqual(["c", "r"]);
  });

  it("orders status groups as running → awaitingHuman → completed → failed", () => {
    const out = buildRunsList({
      instances: [
        mkRun("f", "failed", "2026-05-27T10:00:00Z"),
        mkRun("c", "completed", "2026-05-27T10:00:00Z"),
        mkRun("r", "running", "2026-05-27T10:00:00Z"),
        mkRun("a", "awaitingHuman", "2026-05-27T10:00:00Z"),
      ],
      pinnedIds: new Set(),
      statusFilter: new Set(),
      groupMode: "status",
    });
    expect(out.map((g) => g.status)).toEqual([
      "running",
      "awaitingHuman",
      "completed",
      "failed",
    ]);
  });

  it("groupMode 'template' produces one group per templateId@version", () => {
    const out = buildRunsList({
      instances: [
        mkRun("a", "running", "2026-05-27T10:00:00Z", "foo", "v1"),
        mkRun("b", "completed", "2026-05-27T11:00:00Z", "foo", "v1"),
        mkRun("c", "running", "2026-05-27T12:00:00Z", "bar", "v2"),
      ],
      pinnedIds: new Set(),
      statusFilter: new Set(),
      groupMode: "template",
    });
    expect(out.map((g) => g.id).sort()).toEqual([
      "template:bar@v2",
      "template:foo@v1",
    ]);
    const foo = out.find((g) => g.id === "template:foo@v1")!;
    expect(foo.items.map((i) => i.instance.id)).toEqual(["b", "a"]);
  });

  it("groupMode 'none' produces a single flat group sorted desc", () => {
    const out = buildRunsList({
      instances: [
        mkRun("a", "running", "2026-05-27T10:00:00Z"),
        mkRun("b", "completed", "2026-05-27T12:00:00Z"),
      ],
      pinnedIds: new Set(),
      statusFilter: new Set(),
      groupMode: "none",
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("all");
    expect(out[0].items.map((i) => i.instance.id)).toEqual(["b", "a"]);
  });

  it("prepends an Épinglés group when there are pinned ids (and keeps them in their natural group)", () => {
    const a = mkRun("a", "running", "2026-05-27T10:00:00Z");
    const b = mkRun("b", "completed", "2026-05-27T11:00:00Z");
    const out = buildRunsList({
      instances: [a, b],
      pinnedIds: new Set(["a"]),
      statusFilter: new Set(),
      groupMode: "status",
    });
    expect(out[0].id).toBe("pinned");
    expect(out[0].items.map((i) => i.instance.id)).toEqual(["a"]);
    const running = out.find((g) => g.id === "status:running");
    expect(running?.items.map((i) => i.instance.id)).toEqual(["a"]);
  });

  it("marks pinned items via the `pinned` flag on each RunsListItem", () => {
    const out = buildRunsList({
      instances: [mkRun("a", "running", "2026-05-27T10:00:00Z")],
      pinnedIds: new Set(["a"]),
      statusFilter: new Set(),
      groupMode: "none",
    });
    expect(out[0].items[0].pinned).toBe(true);
  });
});
