// Modèle du graphe d'évolution de la consommation de tokens, rendu sous la
// chronologie d'un run (GanttChart). Construit en joignant les totaux par étape
// (`StepTokenUsage`, venus du log `wf_runs`) avec le timing des exécutions
// (`InstanceView.executions`). L'axe X partage `t0Ms`/`tEndMs` avec le Gantt
// pour un alignement visuel parfait.

export type TokenPoint = {
  readonly stepExecId: string;
  readonly stepId: string;
  readonly label: string;
  /** Instant (ms relatifs à `t0Ms`) où les tokens ont été comptabilisés. */
  readonly atMs: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly total: number;
  readonly costUsd?: number;
  /** Cumuls jusqu'à ce point inclus — pilotent les aires empilées. */
  readonly cumIn: number;
  readonly cumOut: number;
  readonly cumTotal: number;
};

export type TokenModel = {
  readonly t0Ms: number;
  readonly tEndMs: number;
  readonly points: ReadonlyArray<TokenPoint>;
  readonly totalIn: number;
  readonly totalOut: number;
  readonly totalTokens: number;
  /** `undefined` si aucun provider n'a remonté de coût. */
  readonly totalCostUsd?: number;
};
