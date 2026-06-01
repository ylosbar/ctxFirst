import type {
  InstanceSummaryView,
  ScheduleView,
} from "../../../domain/workflow/types";

export type OverviewColumnId =
  | "scheduled"
  | "running"
  | "awaitingHuman"
  | "error"
  | "completed";

export type OverviewCard =
  | {
      readonly kind: "run";
      readonly instance: InstanceSummaryView;
      readonly templateName: string | null;
    }
  | {
      readonly kind: "schedule";
      readonly schedule: ScheduleView;
      readonly templateName: string | null;
    };

export type OverviewColumn = {
  readonly id: OverviewColumnId;
  readonly label: string;
  readonly cards: ReadonlyArray<OverviewCard>;
  /** Cards beyond the display cap (only `completed` is bounded for now). */
  readonly overflowCount: number;
};
