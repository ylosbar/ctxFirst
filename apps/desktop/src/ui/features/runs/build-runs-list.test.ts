import { describe, expect, it } from "vitest";
import type {
  InstanceStatus,
  InstanceSummaryView,
} from "../../../domain/workflow/types";
import { buildRunsList, flattenRunsList } from "./build-runs-list";

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

  describe("template.invoke nesting (§11)", () => {
    const withParent = (
      r: InstanceSummaryView,
      parentId: string,
    ): InstanceSummaryView => ({
      ...r,
      parent: { instanceId: parentId, stepExecId: `exec-${r.id}` },
    });

    it("nests children under their parent and hides them from the top level", () => {
      const root = mkRun("root", "running", "2026-05-27T10:00:00Z");
      const childA = withParent(
        mkRun("childA", "completed", "2026-05-27T10:01:00Z"),
        "root",
      );
      const grandchild = withParent(
        mkRun("gc", "completed", "2026-05-27T10:02:00Z"),
        "childA",
      );
      const out = buildRunsList({
        instances: [root, childA, grandchild],
        pinnedIds: new Set(),
        statusFilter: new Set(),
        groupMode: "none",
      });
      // Only the root shows at the top level.
      expect(out[0].items.map((i) => i.instance.id)).toEqual(["root"]);
      const rootItem = out[0].items[0];
      expect(rootItem.depth).toBe(0);
      expect(rootItem.children.map((c) => c.instance.id)).toEqual(["childA"]);
      const childItem = rootItem.children[0];
      expect(childItem.depth).toBe(1);
      expect(childItem.children.map((c) => c.instance.id)).toEqual(["gc"]);
      expect(childItem.children[0].depth).toBe(2);
    });

    it("groups by the root's status, not the children's", () => {
      const root = mkRun("root", "running", "2026-05-27T10:00:00Z");
      const child = withParent(
        mkRun("child", "failed", "2026-05-27T10:01:00Z"),
        "root",
      );
      const out = buildRunsList({
        instances: [root, child],
        pinnedIds: new Set(),
        statusFilter: new Set(),
        groupMode: "status",
      });
      // Single "running" group containing root → child; no "failed" group.
      expect(out.map((g) => g.id)).toEqual(["status:running"]);
      expect(out[0].items[0].children.map((c) => c.instance.id)).toEqual([
        "child",
      ]);
    });

    it("promotes an orphan (parent filtered out) to a display root", () => {
      const root = mkRun("root", "completed", "2026-05-27T10:00:00Z");
      const child = withParent(
        mkRun("child", "running", "2026-05-27T10:01:00Z"),
        "root",
      );
      const out = buildRunsList({
        instances: [root, child],
        pinnedIds: new Set(),
        statusFilter: new Set(["running"]),
        groupMode: "status",
      });
      // root is filtered out → child has no present parent → shown as a root.
      expect(out.map((g) => g.id)).toEqual(["status:running"]);
      const item = out[0].items[0];
      expect(item.instance.id).toBe("child");
      expect(item.depth).toBe(0);
      expect(item.children).toEqual([]);
    });

    it("renders pinned children flat in the Épinglés group (no nesting)", () => {
      const root = mkRun("root", "running", "2026-05-27T10:00:00Z");
      const child = withParent(
        mkRun("child", "completed", "2026-05-27T10:01:00Z"),
        "root",
      );
      const out = buildRunsList({
        instances: [root, child],
        pinnedIds: new Set(["child"]),
        statusFilter: new Set(),
        groupMode: "none",
      });
      const pinned = out.find((g) => g.id === "pinned");
      expect(pinned?.items.map((i) => i.instance.id)).toEqual(["child"]);
      expect(pinned?.items[0].children).toEqual([]);
      // And it still nests under root in the natural group.
      const all = out.find((g) => g.id === "all");
      expect(all?.items[0].children.map((c) => c.instance.id)).toEqual([
        "child",
      ]);
    });
  });
});

describe("flattenRunsList", () => {
  const withParent = (
    r: InstanceSummaryView,
    parentId: string,
  ): InstanceSummaryView => ({
    ...r,
    parent: { instanceId: parentId, stepExecId: `exec-${r.id}` },
  });

  const groupsOf = (
    instances: ReadonlyArray<InstanceSummaryView>,
    pinnedIds: ReadonlySet<string> = new Set(),
  ) =>
    buildRunsList({
      instances,
      pinnedIds,
      statusFilter: new Set(),
      groupMode: "status",
    });

  it("emits a header then its runs, in order", () => {
    const groups = groupsOf([
      mkRun("b", "running", "2026-05-27T12:00:00Z"),
      mkRun("a", "running", "2026-05-27T10:00:00Z"),
    ]);
    const rows = flattenRunsList({
      groups,
      collapsedGroupIds: new Set(),
      collapsedRunIds: new Set(),
      hasQuery: false,
    });
    expect(rows.map((r) => r.kind)).toEqual(["groupHeader", "run", "run"]);
    expect(rows[0].kind === "groupHeader" && rows[0].group.id).toBe(
      "status:running",
    );
    expect(
      rows.flatMap((r) => (r.kind === "run" ? [r.node.instance.id] : [])),
    ).toEqual(["b", "a"]);
  });

  it("a collapsed group emits only its header", () => {
    const groups = groupsOf([mkRun("a", "running", "2026-05-27T10:00:00Z")]);
    const rows = flattenRunsList({
      groups,
      collapsedGroupIds: new Set(["status:running"]),
      collapsedRunIds: new Set(),
      hasQuery: false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("groupHeader");
    expect(rows[0].kind === "groupHeader" && rows[0].collapsed).toBe(true);
  });

  it("hasQuery forces a collapsed group open", () => {
    const groups = groupsOf([mkRun("a", "running", "2026-05-27T10:00:00Z")]);
    const rows = flattenRunsList({
      groups,
      collapsedGroupIds: new Set(["status:running"]),
      collapsedRunIds: new Set(),
      hasQuery: true,
    });
    expect(rows.map((r) => r.kind)).toEqual(["groupHeader", "run"]);
    expect(rows[0].kind === "groupHeader" && rows[0].collapsed).toBe(false);
  });

  it("emits nested children in pre-order under an expanded run", () => {
    const root = mkRun("root", "running", "2026-05-27T10:00:00Z");
    const child = withParent(
      mkRun("child", "completed", "2026-05-27T10:01:00Z"),
      "root",
    );
    const groups = groupsOf([root, child]);
    const rows = flattenRunsList({
      groups,
      collapsedGroupIds: new Set(),
      collapsedRunIds: new Set(),
      hasQuery: false,
    });
    const runs = rows.filter((r) => r.kind === "run");
    expect(
      runs.map((r) => (r.kind === "run" ? r.node.instance.id : null)),
    ).toEqual(["root", "child"]);
    const rootRow = runs[0];
    expect(rootRow.kind === "run" && rootRow.hasChildren).toBe(true);
    expect(rootRow.kind === "run" && rootRow.expanded).toBe(true);
    expect(runs[1].kind === "run" && runs[1].node.depth).toBe(1);
  });

  it("a collapsed run hides its descendants but keeps the row", () => {
    const root = mkRun("root", "running", "2026-05-27T10:00:00Z");
    const child = withParent(
      mkRun("child", "completed", "2026-05-27T10:01:00Z"),
      "root",
    );
    const groups = groupsOf([root, child]);
    const rows = flattenRunsList({
      groups,
      collapsedGroupIds: new Set(),
      collapsedRunIds: new Set(["root"]),
      hasQuery: false,
    });
    const runs = rows.filter((r) => r.kind === "run");
    expect(
      runs.map((r) => (r.kind === "run" ? r.node.instance.id : null)),
    ).toEqual(["root"]);
    expect(runs[0].kind === "run" && runs[0].expanded).toBe(false);
    expect(runs[0].kind === "run" && runs[0].hasChildren).toBe(true);
  });

  it("tags each run row with its owning group id", () => {
    const a = mkRun("a", "running", "2026-05-27T10:00:00Z");
    const groups = groupsOf([a], new Set(["a"]));
    const rows = flattenRunsList({
      groups,
      collapsedGroupIds: new Set(),
      collapsedRunIds: new Set(),
      hasQuery: false,
    });
    // `a` is pinned: appears once under "pinned" and once under "status:running".
    const runGroups = rows.flatMap((r) => (r.kind === "run" ? [r.groupId] : []));
    expect(runGroups).toEqual(["pinned", "status:running"]);
  });
});
