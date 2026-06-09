import type {
  InstanceStatus,
  InstanceSummaryView,
} from "../../../domain/workflow/types";

export type RunsGroupMode = "status" | "template" | "none";

export type RunsListItem = {
  readonly instance: InstanceSummaryView;
  readonly pinned: boolean;
  /** Nesting depth in the run tree: 0 for a root, +1 per `template.invoke` hop. */
  readonly depth: number;
  /** Child runs spawned by this run's `template.invoke` steps (§11). */
  readonly children: ReadonlyArray<RunsListItem>;
};

export type RunsListGroup = {
  readonly id: string;
  readonly label: string;
  readonly status?: InstanceStatus;
  readonly items: ReadonlyArray<RunsListItem>;
};

export type BuildRunsListArgs = {
  readonly instances: ReadonlyArray<InstanceSummaryView>;
  readonly pinnedIds: ReadonlySet<string>;
  readonly statusFilter: ReadonlySet<InstanceStatus>;
  readonly groupMode: RunsGroupMode;
};

const STATUS_ORDER: ReadonlyArray<InstanceStatus> = [
  "running",
  "awaitingHuman",
  "completed",
  "failed",
];

const STATUS_LABEL: Record<InstanceStatus, string> = {
  running: "En cours",
  awaitingHuman: "Attente humaine",
  completed: "Terminés",
  failed: "Échoués",
};

const sortByUpdatedAtDesc = (
  a: InstanceSummaryView,
  b: InstanceSummaryView,
): number => {
  if (a.updatedAt === b.updatedAt) return a.id < b.id ? -1 : 1;
  return a.updatedAt < b.updatedAt ? 1 : -1;
};

/** Shared context for building nested items from a filtered instance set. */
type TreeCtx = {
  readonly pinnedIds: ReadonlySet<string>;
  /** Child summaries keyed by `parent.instanceId`, restricted to the filtered set. */
  readonly childrenByParent: ReadonlyMap<string, InstanceSummaryView[]>;
};

/** Flat item with no children — used for the pinned group. */
const toFlatItem = (
  instance: InstanceSummaryView,
  pinnedIds: ReadonlySet<string>,
): RunsListItem => ({
  instance,
  pinned: pinnedIds.has(instance.id),
  depth: 0,
  children: [],
});

/**
 * Builds an item plus its descendant subtree from {@link TreeCtx}. `seen`
 * guards against a malformed parent link forming a cycle.
 */
const toTreeItem = (
  instance: InstanceSummaryView,
  ctx: TreeCtx,
  depth: number,
  seen: Set<string>,
): RunsListItem => {
  seen.add(instance.id);
  const children = [...(ctx.childrenByParent.get(instance.id) ?? [])]
    .filter((c) => !seen.has(c.id))
    .sort(sortByUpdatedAtDesc)
    .map((c) => toTreeItem(c, ctx, depth + 1, seen));
  return {
    instance,
    pinned: ctx.pinnedIds.has(instance.id),
    depth,
    children,
  };
};

const groupByStatus = (
  roots: ReadonlyArray<InstanceSummaryView>,
  ctx: TreeCtx,
): ReadonlyArray<RunsListGroup> => {
  const byStatus = new Map<InstanceStatus, InstanceSummaryView[]>();
  for (const inst of roots) {
    const bucket = byStatus.get(inst.status) ?? [];
    bucket.push(inst);
    byStatus.set(inst.status, bucket);
  }
  const groups: RunsListGroup[] = [];
  for (const status of STATUS_ORDER) {
    const bucket = byStatus.get(status);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort(sortByUpdatedAtDesc);
    groups.push({
      id: `status:${status}`,
      label: STATUS_LABEL[status],
      status,
      items: bucket.map((i) => toTreeItem(i, ctx, 0, new Set())),
    });
  }
  return groups;
};

const groupByTemplate = (
  roots: ReadonlyArray<InstanceSummaryView>,
  ctx: TreeCtx,
): ReadonlyArray<RunsListGroup> => {
  const byTemplate = new Map<string, InstanceSummaryView[]>();
  for (const inst of roots) {
    const ref = `${inst.templateId}@${inst.templateVersion}`;
    const bucket = byTemplate.get(ref) ?? [];
    bucket.push(inst);
    byTemplate.set(ref, bucket);
  }
  const refs = [...byTemplate.keys()].sort((a, b) => a.localeCompare(b));
  return refs.map((ref) => {
    const bucket = [...(byTemplate.get(ref) ?? [])];
    bucket.sort(sortByUpdatedAtDesc);
    return {
      id: `template:${ref}`,
      label: ref,
      items: bucket.map((i) => toTreeItem(i, ctx, 0, new Set())),
    };
  });
};

const flatGroup = (
  roots: ReadonlyArray<InstanceSummaryView>,
  ctx: TreeCtx,
): ReadonlyArray<RunsListGroup> => {
  const sorted = [...roots].sort(sortByUpdatedAtDesc);
  if (sorted.length === 0) return [];
  return [
    {
      id: "all",
      label: "Tous",
      items: sorted.map((i) => toTreeItem(i, ctx, 0, new Set())),
    },
  ];
};

/**
 * Pure: filtre par statut, trie par updatedAt desc, groupe selon `groupMode`.
 *
 * Les runs issus d'un `template.invoke` (`parent` défini, §11) sont **imbriqués**
 * sous leur parent : seuls les "roots d'affichage" — instances sans parent, ou
 * dont le parent est absent du jeu filtré — apparaissent au top niveau de chaque
 * groupe ; leurs descendants pendent en dessous (`item.children`). Le groupe
 * d'un root est déterminé par le statut/template du root.
 *
 * Les runs épinglés sont toujours remontés dans un groupe "Épinglés" en tête
 * (rendu à plat, sans imbrication), indépendamment du groupMode.
 */
export const buildRunsList = (
  args: BuildRunsListArgs,
): ReadonlyArray<RunsListGroup> => {
  const filtered =
    args.statusFilter.size === 0
      ? args.instances
      : args.instances.filter((i) => args.statusFilter.has(i.status));
  if (filtered.length === 0) return [];

  const presentIds = new Set(filtered.map((i) => i.id));
  const childrenByParent = new Map<string, InstanceSummaryView[]>();
  for (const inst of filtered) {
    const parentId = inst.parent?.instanceId;
    if (parentId === undefined || !presentIds.has(parentId)) continue;
    const bucket = childrenByParent.get(parentId);
    if (bucket) bucket.push(inst);
    else childrenByParent.set(parentId, [inst]);
  }
  const ctx: TreeCtx = { pinnedIds: args.pinnedIds, childrenByParent };

  // Display roots: no parent, or a parent that was filtered out (orphan → root).
  const roots = filtered.filter((i) => {
    const parentId = i.parent?.instanceId;
    return parentId === undefined || !presentIds.has(parentId);
  });

  let groups: ReadonlyArray<RunsListGroup>;
  switch (args.groupMode) {
    case "status":
      groups = groupByStatus(roots, ctx);
      break;
    case "template":
      groups = groupByTemplate(roots, ctx);
      break;
    case "none":
      groups = flatGroup(roots, ctx);
      break;
  }

  const pinnedInstances = filtered.filter((i) => args.pinnedIds.has(i.id));
  if (pinnedInstances.length === 0) return groups;

  const sortedPinned = [...pinnedInstances].sort(sortByUpdatedAtDesc);
  const pinnedGroup: RunsListGroup = {
    id: "pinned",
    label: "Épinglés",
    items: sortedPinned.map((i) => toFlatItem(i, args.pinnedIds)),
  };
  return [pinnedGroup, ...groups];
};

export const RUNS_STATUS_ORDER = STATUS_ORDER;
export const RUNS_STATUS_LABEL = STATUS_LABEL;

// ── Flattening for virtualization ────────────────────────────────────────────

/**
 * One render descriptor in the flattened runs list. Group headers and run rows
 * share a single array so the virtualizer sees a flat, indexable list (see
 * `specs/virtualized-list.md` §3). `expanded`/`collapsed` are resolved here, not
 * by the rows, so the visible window is known before any row renders.
 */
export type RunListRow =
  | {
      readonly kind: "groupHeader";
      readonly group: RunsListGroup;
      readonly collapsed: boolean;
    }
  | {
      readonly kind: "run";
      readonly node: RunsListItem;
      /** Owning group id — disambiguates a run that appears pinned and grouped. */
      readonly groupId: string;
      readonly hasChildren: boolean;
      readonly expanded: boolean;
    };

export type FlattenRunsListArgs = {
  readonly groups: ReadonlyArray<RunsListGroup>;
  readonly collapsedGroupIds: ReadonlySet<string>;
  readonly collapsedRunIds: ReadonlySet<string>;
  /** Active search forces every group open, mirroring the legacy `forceOpen`. */
  readonly hasQuery: boolean;
};

/**
 * Pure: walks the grouped run tree into a flat, depth-tagged array honouring the
 * collapse sets. A collapsed group emits only its header; an expanded run emits
 * its descendants in pre-order beneath it. With an active query every group is
 * forced open (the collapse set is ignored), matching the previous behaviour.
 */
export const flattenRunsList = (args: FlattenRunsListArgs): RunListRow[] => {
  const { groups, collapsedGroupIds, collapsedRunIds, hasQuery } = args;
  const out: RunListRow[] = [];
  for (const group of groups) {
    const collapsed = !hasQuery && collapsedGroupIds.has(group.id);
    out.push({ kind: "groupHeader", group, collapsed });
    if (collapsed) continue;
    const pushNode = (node: RunsListItem): void => {
      const hasChildren = node.children.length > 0;
      const expanded = hasChildren && !collapsedRunIds.has(node.instance.id);
      out.push({ kind: "run", node, groupId: group.id, hasChildren, expanded });
      if (expanded) {
        for (const child of node.children) pushNode(child);
      }
    };
    for (const node of group.items) pushNode(node);
  }
  return out;
};
