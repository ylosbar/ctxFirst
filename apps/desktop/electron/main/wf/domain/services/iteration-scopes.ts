/**
 * Pure topology analysis that infers iteration scopes opened by `loop.foreach`
 * / `loop.collect` pairs in a {@link WorkflowTemplate}. The result is
 * orchestrator-facing: it tells us, for any step or transition, which loop
 * scope (if any) it belongs to.
 *
 * Domain service: no IO, no registry, no mutation.
 *
 * v1 invariants enforced (see `loop-foreach-array-iteration.md` §E):
 *   - **Unmatched**: every `loop.foreach` has exactly one `loop.collect`
 *     reachable through non-loop edges (and inversely).
 *   - **Nested**: a step inside scope X cannot be another `loop.foreach`.
 *   - **Bypass**: every non-loop edge whose source is inside scope X must
 *     either stay inside X or be the edge leaving the scope's `loop.collect`.
 *   - **Cross-feedback**: a feedback (`isLoop`) edge cannot cross the scope
 *     boundary — both endpoints must share the same scope (or both be
 *     outside).
 */
import type { StepId } from "../ids";
import type { WorkflowTemplate } from "../template";

/** Distinguishes the scope-rule violations for caller messaging. */
export type IterationScopeErrorCode =
  | "loop-unmatched"
  | "loop-nested"
  | "loop-bypass"
  | "loop-feedback-cross"
  | "loop-branch-in-scope";

export class IterationScopeError extends Error {
  constructor(
    readonly code: IterationScopeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type IterationScopes = {
  /**
   * Scope assignment per step id. A step is "in scope X" when it lies on a
   * non-loop path from the `loop.foreach` X to its paired `loop.collect`
   * (exclusive of both endpoints). The `foreach` step itself is **not**
   * recorded as in-scope (it sits at the boundary, outputting to the
   * iteration set). The `collect` step is also **not** in-scope (it sits at
   * the closing boundary, consuming the iteration outputs).
   */
  scopeByStep: ReadonlyMap<StepId, StepId>;
  /**
   * Scope assignment per transition. Independent from `scopeByStep` because
   * an edge can be in-scope while one of its endpoints is the foreach/collect
   * boundary itself.
   *
   * Keyed by the canonical edge index in `template.transitions[]`.
   */
  scopeByTransitionIndex: ReadonlyMap<number, StepId>;
  /** Maps each `loop.foreach` step id to its paired `loop.collect` (if any). */
  collectOf: ReadonlyMap<StepId, StepId>;
  /** Reverse of `collectOf`. */
  foreachOf: ReadonlyMap<StepId, StepId>;
};

const FOREACH_KIND = "loop.foreach";
const COLLECT_KIND = "loop.collect";

export const inferIterationScopes = (tpl: WorkflowTemplate): IterationScopes => {
  const stepKind = new Map<StepId, string>(tpl.steps.map((s) => [s.id, s.kind]));
  const foreachIds = tpl.steps.filter((s) => s.kind === FOREACH_KIND).map((s) => s.id);
  const collectIds = tpl.steps.filter((s) => s.kind === COLLECT_KIND).map((s) => s.id);

  // Adjacency over non-loop edges (forward & reverse).
  const forward = new Map<StepId, StepId[]>();
  const backward = new Map<StepId, StepId[]>();
  tpl.transitions.forEach((t) => {
    if (t.isLoop) return;
    const f = forward.get(t.from) ?? [];
    f.push(t.to);
    forward.set(t.from, f);
    const b = backward.get(t.to) ?? [];
    b.push(t.from);
    backward.set(t.to, b);
  });

  const scopeByStep = new Map<StepId, StepId>();
  const collectOf = new Map<StepId, StepId>();
  const foreachOf = new Map<StepId, StepId>();

  // For each foreach, BFS forward (non-loop, skipping nested foreaches per
  // invariant) until we hit a collect. Steps visited along the way (excluding
  // the foreach and the collect) are in scope.
  for (const fId of foreachIds) {
    const reachableCollects = new Set<StepId>();
    const visited = new Set<StepId>();
    const inScope = new Set<StepId>();
    const queue: StepId[] = [];
    for (const next of forward.get(fId) ?? []) queue.push(next);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const k = stepKind.get(cur);
      if (k === COLLECT_KIND) {
        reachableCollects.add(cur);
        // Do not traverse past the collect — it closes the scope.
        continue;
      }
      if (k === FOREACH_KIND) {
        throw new IterationScopeError(
          "loop-nested",
          `step ${cur} is a ${FOREACH_KIND} inside the scope of ${fId} — nested loops are not supported in v1`,
        );
      }
      if (k && k.startsWith("branch.")) {
        throw new IterationScopeError(
          "loop-branch-in-scope",
          `step ${cur} (${k}) is inside the scope of ${fId} — branching inside a foreach scope is not supported in v1`,
        );
      }
      inScope.add(cur);
      for (const next of forward.get(cur) ?? []) queue.push(next);
    }

    if (reachableCollects.size === 0) {
      throw new IterationScopeError(
        "loop-unmatched",
        `${FOREACH_KIND} ${fId} has no reachable ${COLLECT_KIND}`,
      );
    }
    if (reachableCollects.size > 1) {
      throw new IterationScopeError(
        "loop-unmatched",
        `${FOREACH_KIND} ${fId} reaches multiple ${COLLECT_KIND} steps: ${[...reachableCollects].join(", ")}`,
      );
    }
    const cId = [...reachableCollects][0];
    if (foreachOf.has(cId)) {
      throw new IterationScopeError(
        "loop-unmatched",
        `${COLLECT_KIND} ${cId} is claimed by both ${foreachOf.get(cId)} and ${fId}`,
      );
    }
    collectOf.set(fId, cId);
    foreachOf.set(cId, fId);
    for (const s of inScope) {
      const previous = scopeByStep.get(s);
      if (previous && previous !== fId) {
        throw new IterationScopeError(
          "loop-nested",
          `step ${s} belongs to scopes of both ${previous} and ${fId}`,
        );
      }
      scopeByStep.set(s, fId);
    }
  }

  // Every collect must be paired.
  for (const cId of collectIds) {
    if (!foreachOf.has(cId)) {
      throw new IterationScopeError(
        "loop-unmatched",
        `${COLLECT_KIND} ${cId} has no matching ${FOREACH_KIND}`,
      );
    }
  }

  // Compute per-transition scope + invariants (bypass, feedback-cross).
  const scopeByTransitionIndex = new Map<number, StepId>();
  tpl.transitions.forEach((t, idx) => {
    const fromScope = scopeOfStep(t.from, scopeByStep, foreachOf);
    const toScope = scopeOfStep(t.to, scopeByStep, foreachOf);

    if (t.isLoop) {
      // Cross-feedback: both ends must share the same scope (or both be outside).
      if (fromScope !== toScope) {
        throw new IterationScopeError(
          "loop-feedback-cross",
          `feedback edge ${t.from} → ${t.to} crosses an iteration scope boundary (${describe(fromScope)} vs ${describe(toScope)})`,
        );
      }
      if (fromScope) scopeByTransitionIndex.set(idx, fromScope);
      return;
    }

    // Non-loop edges: bypass check. Determine "edge scope" — the scope this
    // edge logically belongs to. The boundaries are:
    //   - Entry edge (foreach → first internal step): edge is in scope X.
    //   - Internal edge (in-scope step → in-scope step): edge is in scope X.
    //   - Exit edge (last internal step → collect): edge is in scope X.
    //   - Outside edge (no endpoint in scope): edge is not in any scope.
    //   - Foreach output going outside its scope (foreach → collect direct, or
    //     foreach → a step outside): only the in-scope branch is legal in v1.
    const fromIsForeach = stepKind.get(t.from) === FOREACH_KIND;
    const toIsCollect = stepKind.get(t.to) === COLLECT_KIND;

    if (fromIsForeach && toIsCollect) {
      // Direct foreach → collect: degenerate but legal (empty-body iteration).
      // Edge belongs to the scope of the foreach.
      const pair = collectOf.get(t.from);
      if (pair !== t.to) {
        throw new IterationScopeError(
          "loop-bypass",
          `edge ${t.from} → ${t.to}: ${FOREACH_KIND} routes to an unmatched ${COLLECT_KIND}`,
        );
      }
      scopeByTransitionIndex.set(idx, t.from);
      return;
    }

    if (fromIsForeach) {
      // Foreach → internal step: edge is in scope of the foreach.
      // The destination must end up reaching the foreach's collect — which is
      // guaranteed by the BFS above (it set scopeByStep[t.to] = foreach).
      const scope = scopeByStep.get(t.to);
      if (scope !== t.from) {
        throw new IterationScopeError(
          "loop-bypass",
          `edge ${t.from} → ${t.to}: ${FOREACH_KIND} fans out to a step not inside its scope`,
        );
      }
      scopeByTransitionIndex.set(idx, t.from);
      return;
    }

    if (toIsCollect) {
      // In-scope step → collect: edge belongs to the scope.
      const expectedScope = foreachOf.get(t.to);
      if (!expectedScope) {
        // Already rejected above (unmatched collect).
        return;
      }
      if (fromScope !== expectedScope) {
        throw new IterationScopeError(
          "loop-bypass",
          `edge ${t.from} → ${t.to}: source is not inside the scope opened by ${expectedScope}`,
        );
      }
      scopeByTransitionIndex.set(idx, expectedScope);
      return;
    }

    if (fromScope && toScope && fromScope === toScope) {
      scopeByTransitionIndex.set(idx, fromScope);
      return;
    }
    if (fromScope && !toScope) {
      throw new IterationScopeError(
        "loop-bypass",
        `edge ${t.from} → ${t.to}: in-scope step (${fromScope}) routes outside without going through its ${COLLECT_KIND}`,
      );
    }
    if (!fromScope && toScope) {
      throw new IterationScopeError(
        "loop-bypass",
        `edge ${t.from} → ${t.to}: outside step routes into scope ${toScope} without going through its ${FOREACH_KIND}`,
      );
    }
    // Both outside — fine.
  });

  return {
    scopeByStep,
    scopeByTransitionIndex,
    collectOf,
    foreachOf,
  };
};

/**
 * Helper used by the orchestrator: matches two iteration keys to decide if
 * a producer's output is visible to a consumer.
 *
 *  - Both undefined ⇒ true (out-of-scope traffic).
 *  - Producer in scope K, consumer in same scope K ⇒ true.
 *  - Producer out-of-scope, consumer in scope K ⇒ true (broadcast upstream).
 *  - Producer in scope K, consumer out-of-scope ⇒ false (would leak items).
 *  - Different scopes ⇒ false.
 */
export const iterationKeyMatches = (
  producerKey: string | undefined,
  consumerKey: string | undefined,
): boolean => {
  if (!consumerKey) return !producerKey;
  if (!producerKey) return true;
  return producerKey === consumerKey;
};

const scopeOfStep = (
  stepId: StepId,
  scopeByStep: ReadonlyMap<StepId, StepId>,
  foreachOf: ReadonlyMap<StepId, StepId>,
): StepId | undefined => {
  const direct = scopeByStep.get(stepId);
  if (direct) return direct;
  // The collect step itself is at the closing boundary — we treat it as
  // "outside" for transit purposes (its output flows back to the global graph).
  const isCollect = foreachOf.has(stepId);
  if (isCollect) return undefined;
  return undefined;
};

const describe = (s: StepId | undefined): string =>
  s ? `scope=${s}` : "outside";

/** Format an iteration key for v1. */
export const buildIterationKey = (loopStepId: StepId, index: number): string =>
  `${loopStepId}:${index}`;
