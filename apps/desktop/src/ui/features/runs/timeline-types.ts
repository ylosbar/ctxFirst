import type { StepExecStatus } from "../../../domain/workflow/types";

export type TimelineRow = {
  readonly stepExecId: string;
  readonly stepId: string;
  readonly label: string;
  readonly status: StepExecStatus;
  readonly startedAtMs: number;
  /**
   * Compute duration, frozen. `0` while `inProgress` — the live elapsed is
   * derived from `startedAtMs` at render (the model stays `now`-independent so
   * it isn't rebuilt every tick).
   */
  readonly durationMs: number;
  readonly inProgress: boolean;
  readonly hasHumanGate: boolean;
  readonly hasError: boolean;
  readonly errorMessage: string | null;
  /** Résumé du humanFeedback, ou null si absent/vide. */
  readonly feedbackSummary: string | null;
  /** Nombre de commentaires de revue attachés (0 si aucun). */
  readonly feedbackCommentCount: number;
  readonly retryOfStepExecId: string | null;
  readonly templateStepOrder: number;
  readonly iterationIndex: number;
  /**
   * Child instance spawned by this step when it is a `template.invoke` (§11).
   * `null` for ordinary steps. The timeline renders an "open child run" link.
   */
  readonly childInstanceId: string | null;
};

export type TimelineGap = {
  /** Exec après laquelle le gap survient (tree-friendly, indépendant du niveau). */
  readonly afterStepExecId: string;
  readonly durationMs: number;
  readonly kind: "humanWait" | "idle";
};

export type TimelineSkipped = {
  readonly stepId: string;
  readonly label: string;
  readonly templateStepOrder: number;
};

/** Feuille : une exécution de step (top-level ou dans une itération). */
export type TimelineStepNode = {
  readonly kind: "step";
  readonly row: TimelineRow;
};

/** Une itération d'une boucle, identifiée par sa iterationKey. */
export type TimelineIterationNode = {
  readonly kind: "iteration";
  readonly iterationKey: string;
  /** Extrait de `${loopStepId}:${index}`. */
  readonly index: number;
  /** Step rows du corps (récursif pour le futur — boucles imbriquées). */
  readonly children: ReadonlyArray<TimelineNode>;
};

/** Une boucle foreach : le foreach (ouverture), ses itérations, le collect (fermeture). */
export type TimelineLoopNode = {
  readonly kind: "loop";
  readonly loopStepId: string;
  /** L'exécution du loop.foreach (en-tête). */
  readonly foreach: TimelineRow;
  /** L'exécution du loop.collect (null si pas encore atteinte). */
  readonly collect: TimelineRow | null;
  readonly iterations: ReadonlyArray<TimelineIterationNode>;
};

export type TimelineNode =
  | TimelineStepNode
  | TimelineLoopNode
  | TimelineIterationNode;

export type TimelineModel = {
  readonly t0Ms: number;
  readonly tEndMs: number;
  readonly nodes: ReadonlyArray<TimelineNode>;
  readonly gaps: ReadonlyArray<TimelineGap>;
  readonly skipped: ReadonlyArray<TimelineSkipped>;
};
