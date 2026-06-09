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
  /** Tokens d'entrée *non cachés* (delta du dernier tour). */
  readonly tokensIn: number;
  readonly tokensOut: number;
  /** Tokens d'entrée écrits / lus en cache (Claude Code prompt caching). */
  readonly cacheCreate: number;
  readonly cacheRead: number;
  /** Total réel de ce point = in + out + cacheCreate + cacheRead. */
  readonly total: number;
  readonly costUsd?: number;
  /** Cumuls jusqu'à ce point inclus — pilotent les aires empilées. */
  readonly cumIn: number;
  readonly cumOut: number;
  readonly cumCacheCreate: number;
  readonly cumCacheRead: number;
  readonly cumTotal: number;
};

export type TokenModel = {
  readonly t0Ms: number;
  readonly tEndMs: number;
  readonly points: ReadonlyArray<TokenPoint>;
  /** Tokens d'entrée non cachés cumulés. */
  readonly totalIn: number;
  readonly totalOut: number;
  /** Tokens de cache cumulés (write / read). */
  readonly totalCacheCreate: number;
  readonly totalCacheRead: number;
  /** Total réel = totalIn + totalOut + totalCacheCreate + totalCacheRead. */
  readonly totalTokens: number;
  /** `undefined` si aucun provider n'a remonté de coût. */
  readonly totalCostUsd?: number;
};
