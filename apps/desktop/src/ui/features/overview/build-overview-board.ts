import type {
  InstanceStatus,
  InstanceSummaryView,
  ScheduleView,
} from "../../../domain/workflow/types";
import { humanizeCron } from "../schedules/humanize-cron";
import type {
  OverviewCard,
  OverviewColumn,
  OverviewColumnId,
} from "./overview-types";

export type BuildOverviewBoardArgs = {
  readonly instances: ReadonlyArray<InstanceSummaryView>;
  readonly schedules: ReadonlyArray<ScheduleView>;
  readonly templatesByRef: ReadonlyMap<string, string>; // "id@version" -> name
  readonly templateFilter: ReadonlySet<string>; // refs sélectionnées (vide = tous)
  readonly statusFilter: ReadonlySet<OverviewColumnId>; // colonnes visibles (vide = toutes)
  readonly query: string; // recherche plein-texte
};

export const OVERVIEW_COLUMN_ORDER: ReadonlyArray<OverviewColumnId> = [
  "scheduled",
  "running",
  "awaitingHuman",
  "error",
  "completed",
];

// Libellés d'en-tête de colonne. Pluriel (cf. spec §4) — distincts des libellés
// de carte qui réutilisent `RUN_STATUS_LABEL` (singulier) via le Badge.
export const OVERVIEW_COLUMN_LABEL: Record<OverviewColumnId, string> = {
  scheduled: "Planifiés",
  running: "En cours",
  awaitingHuman: "Attente validation",
  error: "Échoués",
  completed: "Terminés",
};

const STATUS_TO_COLUMN: Record<InstanceStatus, OverviewColumnId> = {
  running: "running",
  awaitingHuman: "awaitingHuman",
  completed: "completed",
  failed: "error",
};

// Borne la colonne `completed` : `listInstances` peut renvoyer beaucoup de runs
// terminés. Les cartes au-delà sont comptées dans `overflowCount` (affiché
// « +N de plus ») plutôt que tronquées silencieusement (cf. spec §11).
const COMPLETED_LIMIT = 50;

const refOf = (inst: InstanceSummaryView): string =>
  `${inst.templateId}@${inst.templateVersion}`;

const sortByUpdatedAtDesc = (
  a: InstanceSummaryView,
  b: InstanceSummaryView,
): number => {
  if (a.updatedAt === b.updatedAt) return a.id < b.id ? -1 : 1;
  return a.updatedAt < b.updatedAt ? 1 : -1;
};

const sortByNextRunAtAsc = (a: ScheduleView, b: ScheduleView): number => {
  const an = a.nextRunAt ?? "";
  const bn = b.nextRunAt ?? "";
  if (an === bn) return a.id < b.id ? -1 : 1;
  return an < bn ? -1 : 1;
};

const matchesQuery = (haystacks: ReadonlyArray<string | null>, q: string) =>
  q === "" || haystacks.some((h) => h != null && h.toLowerCase().includes(q));

/**
 * Pure: projette runs + schedules en 5 colonnes par statut.
 * - `templateFilter` (OR interne) et `statusFilter` (colonnes masquées) se
 *   combinent en AND, comme la FilterBar du kanban.
 * - `query` filtre intra-cartes (nom de template, id court, nom de schedule,
 *   cron humanisé).
 * - Une colonne vide reste présente (en-tête + empty state).
 */
export const buildOverviewBoard = (
  args: BuildOverviewBoardArgs,
): ReadonlyArray<OverviewColumn> => {
  const q = args.query.trim().toLowerCase();
  const passesTemplate = (ref: string) =>
    args.templateFilter.size === 0 || args.templateFilter.has(ref);

  // Schedules → colonne `scheduled`. Exclut désactivés / sans nextRunAt.
  const scheduleCards: OverviewCard[] = [...args.schedules]
    .filter((s) => s.enabled && s.nextRunAt != null)
    .filter((s) => passesTemplate(s.templateRef))
    .sort(sortByNextRunAtAsc)
    .filter((s) =>
      matchesQuery([s.name, humanizeCron(s.cron)], q),
    )
    .map((schedule) => ({
      kind: "schedule",
      schedule,
      templateName: args.templatesByRef.get(schedule.templateRef) ?? null,
    }));

  // Runs → une colonne par statut.
  const runCardsByColumn = new Map<OverviewColumnId, OverviewCard[]>();
  const sortedRuns = [...args.instances].sort(sortByUpdatedAtDesc);
  for (const inst of sortedRuns) {
    const ref = refOf(inst);
    if (!passesTemplate(ref)) continue;
    const templateName = args.templatesByRef.get(ref) ?? null;
    if (!matchesQuery([templateName, inst.id.slice(0, 8)], q)) continue;
    const col = STATUS_TO_COLUMN[inst.status];
    const bucket = runCardsByColumn.get(col) ?? [];
    bucket.push({ kind: "run", instance: inst, templateName });
    runCardsByColumn.set(col, bucket);
  }

  const cardsFor = (id: OverviewColumnId): ReadonlyArray<OverviewCard> =>
    id === "scheduled" ? scheduleCards : (runCardsByColumn.get(id) ?? []);

  const visibleColumns =
    args.statusFilter.size === 0
      ? OVERVIEW_COLUMN_ORDER
      : OVERVIEW_COLUMN_ORDER.filter((id) => args.statusFilter.has(id));

  return visibleColumns.map((id) => {
    const all = cardsFor(id);
    if (id === "completed" && all.length > COMPLETED_LIMIT) {
      return {
        id,
        label: OVERVIEW_COLUMN_LABEL[id],
        cards: all.slice(0, COMPLETED_LIMIT),
        overflowCount: all.length - COMPLETED_LIMIT,
      };
    }
    return {
      id,
      label: OVERVIEW_COLUMN_LABEL[id],
      cards: all,
      overflowCount: 0,
    };
  });
};
