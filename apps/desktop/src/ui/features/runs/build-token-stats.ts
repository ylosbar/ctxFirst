import type { StepTokenUsage } from "@shared/wf/token-usage";
import type {
  InstanceView,
  StepExecutionView,
  TemplateView,
} from "../../../domain/workflow/types";
import type { TokenModel, TokenPoint } from "./token-stats-types";

export type BuildTokenStatsArgs = {
  readonly instance: InstanceView;
  readonly template: TemplateView | null;
  readonly usage: ReadonlyArray<StepTokenUsage>;
  /** Origine temporelle partagée avec le Gantt (epoch ms). */
  readonly t0Ms: number;
  /** Fin de l'axe temporel partagée avec le Gantt (epoch ms). */
  readonly tEndMs: number;
};

const EMPTY_MODEL: TokenModel = {
  t0Ms: 0,
  tEndMs: 0,
  points: [],
  totalIn: 0,
  totalOut: 0,
  totalCacheCreate: 0,
  totalCacheRead: 0,
  totalTokens: 0,
  totalCostUsd: undefined,
};

// Instant où les tokens d'une étape sont comptabilisés : fin de calcul
// (`executionEndedAt`), avec repli sur `endedAt` puis `startedAt`. La courbe
// monte donc d'une marche à chaque étape terminée.
const tallyMsOf = (exec: StepExecutionView): number | null => {
  const at = exec.executionEndedAt ?? exec.endedAt ?? exec.startedAt;
  if (!at) return null;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
};

export const buildTokenStats = (args: BuildTokenStatsArgs): TokenModel => {
  const { instance, template, usage, t0Ms, tEndMs } = args;
  if (usage.length === 0) return EMPTY_MODEL;

  const usageByExec = new Map<string, StepTokenUsage>();
  for (const u of usage) usageByExec.set(u.stepExecId, u);

  const execById = new Map<string, StepExecutionView>();
  for (const e of instance.executions) execById.set(e.id, e);

  const stepName = new Map<string, string>();
  const stepOrder = new Map<string, number>();
  template?.steps.forEach((s, i) => {
    stepName.set(s.id, s.name);
    stepOrder.set(s.id, i);
  });

  type Raw = {
    exec: StepExecutionView;
    u: StepTokenUsage;
    atMs: number;
  };
  const raws: Raw[] = [];
  for (const u of usage) {
    const exec = execById.get(u.stepExecId);
    if (!exec) continue;
    const tallyMs = tallyMsOf(exec);
    if (tallyMs === null) continue;
    raws.push({ exec, u, atMs: Math.max(tallyMs - t0Ms, 0) });
  }

  if (raws.length === 0) return EMPTY_MODEL;

  // Tri chronologique ; départage par ordre du template puis par stepExecId
  // pour un résultat déterministe quand deux étapes finissent au même ms.
  raws.sort((a, b) => {
    if (a.atMs !== b.atMs) return a.atMs - b.atMs;
    const oa = stepOrder.get(a.exec.stepId) ?? Number.MAX_SAFE_INTEGER;
    const ob = stepOrder.get(b.exec.stepId) ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.exec.id < b.exec.id ? -1 : 1;
  });

  let cumIn = 0;
  let cumOut = 0;
  let cumCacheCreate = 0;
  let cumCacheRead = 0;
  let totalCostUsd = 0;
  let hasCost = false;

  const points: TokenPoint[] = raws.map((r) => {
    cumIn += r.u.tokensIn;
    cumOut += r.u.tokensOut;
    cumCacheCreate += r.u.cacheCreate;
    cumCacheRead += r.u.cacheRead;
    if (r.u.costUsd != null) {
      totalCostUsd += r.u.costUsd;
      hasCost = true;
    }
    return {
      stepExecId: r.exec.id,
      stepId: r.exec.stepId,
      label: stepName.get(r.exec.stepId) ?? r.exec.stepId,
      atMs: r.atMs,
      tokensIn: r.u.tokensIn,
      tokensOut: r.u.tokensOut,
      cacheCreate: r.u.cacheCreate,
      cacheRead: r.u.cacheRead,
      total: r.u.tokensIn + r.u.tokensOut + r.u.cacheCreate + r.u.cacheRead,
      costUsd: r.u.costUsd,
      cumIn,
      cumOut,
      cumCacheCreate,
      cumCacheRead,
      cumTotal: cumIn + cumOut + cumCacheCreate + cumCacheRead,
    };
  });

  return {
    t0Ms,
    tEndMs,
    points,
    totalIn: cumIn,
    totalOut: cumOut,
    totalCacheCreate: cumCacheCreate,
    totalCacheRead: cumCacheRead,
    totalTokens: cumIn + cumOut + cumCacheCreate + cumCacheRead,
    totalCostUsd: hasCost ? totalCostUsd : undefined,
  };
};

/** Formate un nombre de tokens en notation compacte (1 234 → 1.2k, 2 000 000 → 2M). */
export const formatTokens = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 1_000_000) {
    const k = n / 1000;
    return k < 10 ? `${k.toFixed(1)}k` : `${Math.round(k)}k`;
  }
  const m = n / 1_000_000;
  return m < 10 ? `${m.toFixed(1)}M` : `${Math.round(m)}M`;
};

/** Formate un coût USD : `$0.0123` sous 1 ¢, sinon `$1.23`. */
export const formatCostUsd = (usd: number): string => {
  if (!Number.isFinite(usd) || usd <= 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
};
