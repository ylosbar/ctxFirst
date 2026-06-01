import type {
  StepExecStatus,
  StepExecutionView,
  TemplateView,
} from "../../domain/workflow/types";

export type StepStatus = StepExecStatus | "idle";

const PRIORITY: ReadonlyArray<StepExecStatus> = [
  "awaitingHuman",
  "running",
  "failed",
  "validated",
  "looped",
  "pending",
];

/**
 * BFS depth from `entryStep` along non-loop transitions. Steps unreachable
 * from the entry fall back to depth 0 (rendered at the top, after the entry).
 */
export const computeDepths = (template: TemplateView): Map<string, number> => {
  const forward = new Map<string, string[]>();
  for (const t of template.transitions) {
    if (t.isLoop) continue;
    const list = forward.get(t.from) ?? [];
    list.push(t.to);
    forward.set(t.from, list);
  }
  const depths = new Map<string, number>();
  const visit = (id: string, d: number) => {
    const prev = depths.get(id);
    if (prev !== undefined && prev >= d) return;
    depths.set(id, d);
    for (const next of forward.get(id) ?? []) visit(next, d + 1);
  };
  visit(template.entryStep, 0);
  for (const s of template.steps) {
    if (!depths.has(s.id)) depths.set(s.id, 0);
  }
  return depths;
};

export const resolveStepStatus = (
  stepId: string,
  execs: ReadonlyArray<StepExecutionView>,
): StepStatus => {
  const matching = execs.filter((e) => e.stepId === stepId);
  if (matching.length === 0) return "idle";
  for (const p of PRIORITY) {
    if (matching.some((e) => e.status === p)) return p;
  }
  return matching[matching.length - 1].status;
};

/**
 * Most relevant execution for a step, given the same priority ranking
 * used by `resolveStepStatus`. Returns `null` if the step has never run.
 */
export const findLatestExecForStep = (
  execs: ReadonlyArray<StepExecutionView>,
  stepId: string,
): StepExecutionView | null => {
  const matching = execs.filter((e) => e.stepId === stepId);
  if (matching.length === 0) return null;
  for (const p of PRIORITY) {
    const hit = matching.find((e) => e.status === p);
    if (hit) return hit;
  }
  return matching[matching.length - 1];
};

/**
 * Most relevant active execution across an instance — used to auto-select
 * the step that the user most likely cares about right now.
 */
export const findActive = (
  execs: ReadonlyArray<StepExecutionView>,
): StepExecutionView | null => {
  const awaiting = execs.find((e) => e.status === "awaitingHuman");
  if (awaiting) return awaiting;
  const running = execs.find((e) => e.status === "running");
  if (running) return running;
  const lastValidated = [...execs]
    .reverse()
    .find((e) => e.status === "validated");
  if (lastValidated) return lastValidated;
  return execs.length > 0 ? execs[execs.length - 1] : null;
};

export const findLoopTarget = (
  template: TemplateView | null,
  fromStepId: string | undefined,
): string | null => {
  if (!template || !fromStepId) return null;
  const transition = template.transitions.find(
    (t) => t.isLoop && t.from === fromStepId,
  );
  return transition?.to ?? null;
};

export const findStepKind = (
  template: TemplateView | null,
  stepId: string | undefined,
): string | null => {
  if (!template || !stepId) return null;
  const step = template.steps.find((s) => s.id === stepId);
  return step?.kind ?? null;
};
