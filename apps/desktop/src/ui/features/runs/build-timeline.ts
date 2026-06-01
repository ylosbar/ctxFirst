import type {
  InstanceView,
  StepExecutionView,
  TemplateView,
} from "../../../domain/workflow/types";
import type { StepKindId } from "../../../domain/workflow/types";
import type {
  TimelineGap,
  TimelineIterationNode,
  TimelineLoopNode,
  TimelineModel,
  TimelineNode,
  TimelineRow,
  TimelineSkipped,
} from "./timeline-types";

export type BuildTimelineArgs = {
  readonly instance: InstanceView;
  readonly template: TemplateView | null;
  readonly nowMs?: number;
};

const EMPTY_MODEL: TimelineModel = {
  t0Ms: 0,
  tEndMs: 0,
  nodes: [],
  gaps: [],
  skipped: [],
};

/**
 * Extrait `(loopStepId, index)` d'une `iterationKey`. Format v1 non-empilé
 * `${loopStepId}:${index}` ; on reste tolérant à une évolution vers des clés
 * empilées (boucles imbriquées) en prenant le **dernier** segment comme index
 * et tout le reste comme owner.
 */
const parseIterationKey = (
  key: string,
): { readonly owner: string; readonly index: number } => {
  const sep = key.lastIndexOf(":");
  if (sep < 0) return { owner: key, index: 0 };
  const owner = key.slice(0, sep);
  const index = Number(key.slice(sep + 1));
  return { owner, index: Number.isFinite(index) ? index : 0 };
};

const HUMAN_WAIT_THRESHOLD_MS = 500;
const IDLE_GAP_MIN_MS = 2000;

export const buildTimeline = (args: BuildTimelineArgs): TimelineModel => {
  const { instance, template } = args;
  const nowMs = args.nowMs ?? Date.now();

  if (instance.executions.length === 0) return EMPTY_MODEL;

  const stepIndex = new Map<string, number>();
  const stepName = new Map<string, string>();
  const stepKind = new Map<string, StepKindId>();
  template?.steps.forEach((s, i) => {
    stepIndex.set(s.id, i);
    stepName.set(s.id, s.name);
    stepKind.set(s.id, s.kind);
  });

  const labelFor = (stepId: string): string =>
    stepName.get(stepId) ?? stepId;
  const orderFor = (stepId: string): number =>
    stepIndex.get(stepId) ?? Number.MAX_SAFE_INTEGER;

  const skipped: TimelineSkipped[] = [];
  const considered: StepExecutionView[] = [];
  for (const exec of instance.executions) {
    if (exec.status === "skipped") {
      skipped.push({
        stepId: exec.stepId,
        label: labelFor(exec.stepId),
        templateStepOrder: orderFor(exec.stepId),
      });
      continue;
    }
    if (!exec.startedAt) continue;
    considered.push(exec);
  }

  skipped.sort((a, b) => a.templateStepOrder - b.templateStepOrder);

  if (considered.length === 0) {
    return {
      ...EMPTY_MODEL,
      skipped,
    };
  }

  type Parsed = {
    readonly exec: StepExecutionView;
    readonly startedMs: number;
    readonly execEndedMs: number;
    readonly wallEndedMs: number;
    readonly inProgress: boolean;
  };

  const parsed: Parsed[] = considered.map((exec) => {
    const startedMs = Date.parse(exec.startedAt as string);
    const wallEndedMs = exec.endedAt ? Date.parse(exec.endedAt) : nowMs;
    const execEndedMs = exec.executionEndedAt
      ? Date.parse(exec.executionEndedAt)
      : wallEndedMs;
    // "In progress" = work is still being done. A step in `awaitingHuman`
    // has finished its compute, so it's NOT in progress.
    const inProgress = !exec.executionEndedAt && !exec.endedAt;
    return { exec, startedMs, execEndedMs, wallEndedMs, inProgress };
  });

  parsed.sort((a, b) => a.startedMs - b.startedMs);

  let t0Ms = Number.POSITIVE_INFINITY;
  let tEndMs = Number.NEGATIVE_INFINITY;
  for (const p of parsed) {
    if (p.startedMs < t0Ms) t0Ms = p.startedMs;
    if (p.wallEndedMs > tEndMs) tEndMs = p.wallEndedMs;
  }

  const iterationCounter = new Map<string, number>();
  const rows: TimelineRow[] = parsed.map((p) => {
    const prev = iterationCounter.get(p.exec.stepId) ?? 0;
    const iterationIndex = prev + 1;
    iterationCounter.set(p.exec.stepId, iterationIndex);
    const computeEndMs = p.execEndedMs;
    const durationMs = Math.max(computeEndMs - p.startedMs, 0);
    const hasHumanGate =
      p.exec.status === "awaitingHuman" || !!p.exec.humanFeedback;
    const errorMessage = p.exec.error ?? null;
    const fb = p.exec.humanFeedback;
    const feedbackSummary = fb?.summary?.trim() ? fb.summary : null;
    const feedbackCommentCount = fb?.comments.length ?? 0;
    return {
      stepExecId: p.exec.id,
      stepId: p.exec.stepId,
      label: labelFor(p.exec.stepId),
      status: p.exec.status,
      startedAtMs: p.startedMs,
      durationMs,
      inProgress: p.inProgress,
      hasHumanGate,
      hasError: !!errorMessage,
      errorMessage,
      feedbackSummary,
      feedbackCommentCount,
      retryOfStepExecId: p.exec.loopFrom ?? null,
      templateStepOrder: orderFor(p.exec.stepId),
      iterationIndex,
    };
  });

  const gaps: TimelineGap[] = [];
  for (let i = 0; i < parsed.length - 1; i++) {
    const curr = parsed[i];
    const next = parsed[i + 1];
    const endOfCurr = curr.wallEndedMs;
    const gapMs = next.startedMs - endOfCurr;
    if (gapMs <= 0) continue;

    const humanWaitWindow = curr.wallEndedMs - curr.execEndedMs;
    const isHumanWait =
      !!curr.exec.humanFeedback ||
      curr.exec.status === "awaitingHuman" ||
      humanWaitWindow > HUMAN_WAIT_THRESHOLD_MS;

    if (isHumanWait) {
      gaps.push({
        afterStepExecId: curr.exec.id,
        durationMs: gapMs,
        kind: "humanWait",
      });
    } else if (gapMs > IDLE_GAP_MIN_MS) {
      gaps.push({
        afterStepExecId: curr.exec.id,
        durationMs: gapMs,
        kind: "idle",
      });
    }
  }

  const nodes = buildTree(rows, parsed, stepKind);

  return {
    t0Ms,
    tEndMs,
    nodes,
    gaps,
    skipped,
  };
};

// ── Tree assembly ──────────────────────────────────────────────────────────
//
// Walk the rows in chrono order (runs are strictly sequential, so the exec
// order alone is enough to group — no template topology needed beyond knowing
// each step's *kind*, which tells us where a loop opens (`loop.foreach`) and
// closes (`loop.collect`)).
//
// Mutable builders are used locally then frozen as ReadonlyArray on return;
// the public contract stays immutable, like the rest of buildTimeline.

type IterationBuilder = {
  readonly iterationKey: string;
  readonly index: number;
  readonly children: TimelineNode[];
};

type LoopBuilder = {
  readonly loopStepId: string;
  readonly foreach: TimelineRow;
  collect: TimelineRow | null;
  readonly iterations: IterationBuilder[];
  readonly iterByKey: Map<string, IterationBuilder>;
};

const finalizeLoop = (loop: LoopBuilder): TimelineLoopNode => ({
  kind: "loop",
  loopStepId: loop.loopStepId,
  foreach: loop.foreach,
  collect: loop.collect,
  iterations: loop.iterations
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(
      (it): TimelineIterationNode => ({
        kind: "iteration",
        iterationKey: it.iterationKey,
        index: it.index,
        children: it.children,
      }),
    ),
});

const buildTree = (
  rows: ReadonlyArray<TimelineRow>,
  parsed: ReadonlyArray<{ readonly exec: { readonly iterationKey?: string } }>,
  stepKind: Map<string, StepKindId>,
): TimelineNode[] => {
  const nodes: TimelineNode[] = [];
  let openLoop: LoopBuilder | null = null;

  const flush = () => {
    if (openLoop) nodes.push(finalizeLoop(openLoop));
    openLoop = null;
  };

  rows.forEach((row, i) => {
    const kind = stepKind.get(row.stepId);
    const iterationKey = parsed[i].exec.iterationKey;

    if (kind === "loop.foreach") {
      // A new foreach closes any previous (defensively — should already be
      // closed by its collect) then opens this one.
      flush();
      openLoop = {
        loopStepId: row.stepId,
        foreach: row,
        collect: null,
        iterations: [],
        iterByKey: new Map(),
      };
      return;
    }

    if (kind === "loop.collect" && openLoop) {
      openLoop.collect = row;
      flush();
      return;
    }

    if (iterationKey && openLoop) {
      const { index } = parseIterationKey(iterationKey);
      let it = openLoop.iterByKey.get(iterationKey);
      if (!it) {
        it = { iterationKey, index, children: [] };
        openLoop.iterByKey.set(iterationKey, it);
        openLoop.iterations.push(it);
      }
      it.children.push({ kind: "step", row });
      return;
    }

    // Top-level step (outside any loop) or an orphan iterationKey (incoherent
    // data) → degrade to a top-level step row rather than throwing.
    flush();
    nodes.push({ kind: "step", row });
  });

  flush();
  return nodes;
};
