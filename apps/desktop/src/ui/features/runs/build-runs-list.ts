import type {
  InstanceStatus,
  InstanceSummaryView,
} from "../../../domain/workflow/types";

export type RunsGroupMode = "status" | "template" | "none";

export type RunsListItem = {
  readonly instance: InstanceSummaryView;
  readonly pinned: boolean;
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

const toItem = (
  instance: InstanceSummaryView,
  pinnedIds: ReadonlySet<string>,
): RunsListItem => ({
  instance,
  pinned: pinnedIds.has(instance.id),
});

const groupByStatus = (
  instances: ReadonlyArray<InstanceSummaryView>,
  pinnedIds: ReadonlySet<string>,
): ReadonlyArray<RunsListGroup> => {
  const byStatus = new Map<InstanceStatus, InstanceSummaryView[]>();
  for (const inst of instances) {
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
      items: bucket.map((i) => toItem(i, pinnedIds)),
    });
  }
  return groups;
};

const groupByTemplate = (
  instances: ReadonlyArray<InstanceSummaryView>,
  pinnedIds: ReadonlySet<string>,
): ReadonlyArray<RunsListGroup> => {
  const byTemplate = new Map<string, InstanceSummaryView[]>();
  for (const inst of instances) {
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
      items: bucket.map((i) => toItem(i, pinnedIds)),
    };
  });
};

const flatGroup = (
  instances: ReadonlyArray<InstanceSummaryView>,
  pinnedIds: ReadonlySet<string>,
): ReadonlyArray<RunsListGroup> => {
  const sorted = [...instances].sort(sortByUpdatedAtDesc);
  if (sorted.length === 0) return [];
  return [
    {
      id: "all",
      label: "Tous",
      items: sorted.map((i) => toItem(i, pinnedIds)),
    },
  ];
};

/**
 * Pure: filtre par statut, trie par updatedAt desc, groupe selon `groupMode`.
 * Les runs épinglés sont toujours remontés dans un groupe "Épinglés" en tête,
 * indépendamment du groupMode (et restent dans leur groupe naturel sinon —
 * comportement VSCode-like).
 */
export const buildRunsList = (
  args: BuildRunsListArgs,
): ReadonlyArray<RunsListGroup> => {
  const filtered =
    args.statusFilter.size === 0
      ? args.instances
      : args.instances.filter((i) => args.statusFilter.has(i.status));
  if (filtered.length === 0) return [];

  let groups: ReadonlyArray<RunsListGroup>;
  switch (args.groupMode) {
    case "status":
      groups = groupByStatus(filtered, args.pinnedIds);
      break;
    case "template":
      groups = groupByTemplate(filtered, args.pinnedIds);
      break;
    case "none":
      groups = flatGroup(filtered, args.pinnedIds);
      break;
  }

  const pinnedInstances = filtered.filter((i) => args.pinnedIds.has(i.id));
  if (pinnedInstances.length === 0) return groups;

  const sortedPinned = [...pinnedInstances].sort(sortByUpdatedAtDesc);
  const pinnedGroup: RunsListGroup = {
    id: "pinned",
    label: "Épinglés",
    items: sortedPinned.map((i) => toItem(i, args.pinnedIds)),
  };
  return [pinnedGroup, ...groups];
};

export const RUNS_STATUS_ORDER = STATUS_ORDER;
export const RUNS_STATUS_LABEL = STATUS_LABEL;
