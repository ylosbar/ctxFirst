import type { StepKindId } from "../../../../domain/workflow/types";

/**
 * Kinds whose runners ne peuvent pas être exécutés en isolation depuis le
 * studio — soit ils dépendent du contexte de run (`loopHistory`,
 * `InstanceView`), soit leur outcome n'a pas de sens hors d'un graphe
 * (`workspace-set`, `awaiting-human` pur). Cf. spec §6 "Restrictions par kind".
 */
const UNSUPPORTED_KINDS: ReadonlySet<string> = new Set([
  "loop.foreach",
  "loop.collect",
  "export-run",
]);

/**
 * Kinds qui s'affichent dans le studio mais ne produisent rien d'exploitable —
 * leur outcome (`awaiting-human`, `workspace-set`) est inutile sans un run
 * complet. On les laisse passer (le runner renvoie son outcome, l'UI affiche
 * un callout informatif).
 */
const DEGRADED_KINDS: ReadonlySet<string> = new Set([
  "workspace.set",
  "human.gate",
]);

export const isKindRunnableInStudio = (kind: StepKindId): boolean =>
  !UNSUPPORTED_KINDS.has(kind);

export const isKindDegradedInStudio = (kind: StepKindId): boolean =>
  DEGRADED_KINDS.has(kind);

/**
 * Kinds qui produisent des side-effects natifs réels (shell, LLM, HTTP, fs).
 * L'UI montre un warning visible dès l'ouverture du studio pour ces kinds.
 */
const SIDE_EFFECT_KINDS: ReadonlySet<string> = new Set([
  "shell.exec",
  "agent.invoke",
  "claude_code.invoke",
  "codex.invoke",
  "openrouter.invoke",
  "linear.fetch",
  "linear.set-status",
  "file.load-markdown",
]);

export const hasNativeSideEffects = (kind: StepKindId): boolean =>
  SIDE_EFFECT_KINDS.has(kind);
