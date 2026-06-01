import type { ArtifactKind } from "./artifact";

/** Branded id for a scheduled workflow trigger. */
export type ScheduleId = string & { readonly __brand: "ScheduleId" };

export const asScheduleId = (s: string): ScheduleId => s as ScheduleId;

/** Status of the most recent tick triggered for a schedule. */
export type ScheduleLastStatus = "ok" | "error";

/** Seed payload — same shape consumed by `StartInstance`. */
export type ScheduleSeed = { kind: ArtifactKind; content: string };

/** Persisted shape of a workflow schedule. */
export type WorkflowSchedule = {
  id: ScheduleId;
  /** Owning channel — `null` after the channel was deleted (orphan, visible globally). */
  channelId: string | null;
  name: string;
  /** Pinned `id@version` ref. Editing the template creates a new version that the schedule does NOT follow. */
  templateRef: string;
  /** 5-field cron expression, validated at save time. */
  cron: string;
  /** IANA timezone (e.g. `Europe/Paris`) — `undefined` = local machine time. */
  timezone?: string;
  /** Seeds frozen at create-time — re-applied to every triggered run. */
  seeds: ReadonlyArray<ScheduleSeed>;
  /** Optional CLI working directory forwarded to the run. */
  cwd?: string;
  enabled: boolean;
  lastRunAt?: string;
  lastInstanceId?: string;
  lastStatus?: ScheduleLastStatus;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

/** Write-side payload submitted by the UI. */
export type ScheduleDraft = Pick<
  WorkflowSchedule,
  "name" | "templateRef" | "cron" | "timezone" | "seeds" | "cwd" | "enabled"
> & { id?: ScheduleId };
