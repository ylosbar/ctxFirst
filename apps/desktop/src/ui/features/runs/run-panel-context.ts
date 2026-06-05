import { createContext } from "react";
import type {
  InstanceView,
  LlmSessionEvent,
  StepExecutionView,
  TemplateView,
} from "../../../domain/workflow/types";

export type RunPanelContextValue = {
  readonly template: TemplateView | null;
  readonly instance: InstanceView;
  readonly selected: StepExecutionView | null;
  readonly activeExec: StepExecutionView | null;
  readonly stepExecutions: ReadonlyArray<StepExecutionView>;
  readonly sessions: Readonly<Record<string, ReadonlyArray<LlmSessionEvent>>>;
  readonly pastExecutions: ReadonlyArray<{
    exec: StepExecutionView;
    events: ReadonlyArray<LlmSessionEvent>;
  }>;
  readonly manualSelect: boolean;
  readonly isLlmSessionKind: boolean;
  readonly showHumanGate: boolean;
  readonly loopTargetStepId: string | null;
  readonly stepName: string;
  readonly error: string | null;
  readonly onSelectStep: (stepId: string) => void;
  readonly onSelectExec: (execId: string) => void;
  readonly onValidate: () => void;
  readonly onRequestAdjustments: () => void;
  /**
   * Re-run the run from the given exec (rewind & replay). The target and its
   * transitive downstream are recomputed; the upstream is reused as-is. Only
   * valid for a `validated`/`failed` exec. See `specs/run-rerun-from-node.md`.
   */
  readonly onRerunFromNode: (stepExecId: string) => void;
  /** Number of downstream steps that a re-run from `stepId` would recompute. */
  readonly rerunImpactCount: (stepId: string) => number;
  readonly loadSession: (execId: string) => Promise<void>;
};

// Spec runs-unified-resizable-workspace.md §6.5 — le Run Workspace fournit la
// valeur de contexte directement (sélection détenue par le panel), au lieu de
// la résolution indirecte via l'éditeur actif. `useRunPanelContext` lit ce
// provider et retombe sur `useActiveRunPanel()` quand il est absent.
export const RunPanelContext = createContext<RunPanelContextValue | null>(null);
