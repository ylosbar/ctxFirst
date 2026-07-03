import type {
  InstanceStatus,
  InstanceView,
  StepExecutionView,
  TemplateView,
} from "../../../domain/workflow/types";
import { findActive, findLatestExecForStep } from "../../components/wf-layout";

export type StepExecutionOverlay = {
  /** Dernière exécution du step (toutes statuts confondus, par priorité). */
  readonly latest: StepExecutionView | null;
  /** Nombre total d'itérations du step dans ce run. */
  readonly iterationCount: number;
  /** Le step est-il sur le path actif (= a un exec non-pending) ? */
  readonly onActivePath: boolean;
};

export type RunOverlay = {
  readonly instanceId: string;
  readonly instanceStatus: InstanceStatus;
  readonly byStepId: ReadonlyMap<string, StepExecutionOverlay>;
  /** Edge (from, to) mise en évidence si transition courante. */
  readonly activeTransition: { from: string; to: string } | null;
  /**
   * Step le plus « actif » du run (gate humaine en attente > running > dernier
   * validé > dernier exec), ou `null`. Le graphe de run recentre le viewport
   * dessus quand il change (cf. `useCenterOnActiveStep`).
   */
  readonly activeStepId: string | null;
  /** Nombre d'exécutions dont le stepId n'existe pas dans le template. */
  readonly orphanExecCount: number;
  readonly onSelectStep: (stepId: string) => void;
  readonly selectedStepId: string | null;
};

const isOnActivePath = (latest: StepExecutionView | null): boolean =>
  latest !== null && latest.status !== "pending";

const findActiveTransition = (
  template: TemplateView,
  byStepId: ReadonlyMap<string, StepExecutionOverlay>,
): { from: string; to: string } | null => {
  // We highlight the edge leaving the currently running step, if there is
  // exactly one outgoing non-loop transition. With multiple candidates we
  // can't disambiguate without runtime data, so we skip the highlight.
  for (const [stepId, overlay] of byStepId) {
    if (!overlay.latest) continue;
    if (overlay.latest.status !== "running") continue;
    const outgoing = template.transitions.filter(
      (t) => t.from === stepId && !t.isLoop,
    );
    if (outgoing.length === 1) {
      return { from: outgoing[0].from, to: outgoing[0].to };
    }
  }
  return null;
};

export const buildRunOverlay = (
  instance: InstanceView,
  template: TemplateView,
  selectedStepId: string | null,
  onSelectStep: (stepId: string) => void,
): RunOverlay => {
  const byStepId = new Map<string, StepExecutionOverlay>();
  const templateStepIds = new Set(template.steps.map((s) => s.id));

  for (const step of template.steps) {
    const latest = findLatestExecForStep(instance.executions, step.id);
    const iterationCount = instance.executions.reduce(
      (n, e) => (e.stepId === step.id ? n + 1 : n),
      0,
    );
    byStepId.set(step.id, {
      latest,
      iterationCount,
      onActivePath: isOnActivePath(latest),
    });
  }

  let orphanExecCount = 0;
  for (const exec of instance.executions) {
    if (!templateStepIds.has(exec.stepId)) orphanExecCount += 1;
  }

  // Reuses the same "most relevant execution" ranking that drives the run
  // panel's auto-selection, so the graph centers on the step the user is
  // watching. Orphan execs (stepId absent from the template) can't be centered.
  const active = findActive(instance.executions);
  const activeStepId =
    active && templateStepIds.has(active.stepId) ? active.stepId : null;

  return {
    instanceId: instance.id,
    instanceStatus: instance.status,
    byStepId,
    activeTransition: findActiveTransition(template, byStepId),
    activeStepId,
    orphanExecCount,
    onSelectStep,
    selectedStepId,
  };
};
