/**
 * Pure formatting helpers for step-execution timestamps, used by
 * `StepInfoPanel`. No i18n / locale config beyond the
 * runtime default — these render compact, machine-ish metadata.
 */

export const formatTime = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export const formatDuration = (
  startedAt?: string,
  endedAt?: string,
): string | null => {
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m${sec.toString().padStart(2, "0")}`;
};

/**
 * Compute-time duration of a step execution: counts active work only, excluding
 * wait time. Prefers `executionEndedAt` (set when real work finished — e.g. on
 * `awaitingHuman`, before the human wait) and falls back to the terminal
 * `endedAt`. Keeps the graph tooltip, Gantt and timeline consistent: all three
 * show the same compute time, waits excluded. See `domain/workflow/types.ts`
 * (`StepExecutionView`) and `features/runs/build-step-stats.ts`.
 */
export const formatExecDuration = (exec: {
  startedAt?: string;
  executionEndedAt?: string;
  endedAt?: string;
}): string | null =>
  formatDuration(exec.startedAt, exec.executionEndedAt ?? exec.endedAt);
