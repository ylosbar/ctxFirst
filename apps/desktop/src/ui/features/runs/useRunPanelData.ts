import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useWorkflow from "../../hooks/useWorkflow";
import { useWorkbench } from "../../workbench/WorkbenchProvider";
import {
  findActive,
  findLatestExecForStep,
  findLoopTarget,
  findStepKind,
} from "../../components/wf-layout";
import type { RunPanelContextValue } from "./run-panel-context";
import type { TemplateView } from "../../../domain/workflow/types";
import { reviewUriFor } from "./review-uri";

/**
 * Counts the steps reachable from `from` through non-loop transitions (`from`
 * excluded) — the downstream a rewind & replay would recompute. Mirrors the
 * engine's `transitiveSuccessors` (BFS, dedup, ignore `isLoop`).
 */
const countDownstream = (
  template: TemplateView | null,
  from: string,
): number => {
  if (!template) return 0;
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  let count = 0;
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const tr of template.transitions) {
      if (tr.isLoop) continue;
      if (tr.from !== cur) continue;
      if (seen.has(tr.to)) continue;
      seen.add(tr.to);
      count += 1;
      queue.push(tr.to);
    }
  }
  return count;
};

type Result = {
  readonly contextValue: RunPanelContextValue | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly instanceMissing: boolean;
};

/**
 * Computes the `RunPanelContextValue` from an instance ID — drives selection,
 * gate state and session-loading flow for the run editor (timeline + side panels).
 */
const useRunPanelData = (
  instanceId: string,
  initialStepId?: string | null,
): Result => {
  const {
    instance,
    template,
    sessions,
    validateStep,
    rerunFromNode,
    loadSession,
    error,
    loading,
  } = useWorkflow(instanceId);
  const wb = useWorkbench();

  const [selectedExecId, setSelectedExecId] = useState<string | null>(null);
  const manualSelectRef = useRef(false);
  // Step requested via URL at mount; consumed once the instance arrives, then
  // cleared so it never overrides subsequent live updates or user picks.
  const pendingInitialStepRef = useRef<string | null>(initialStepId ?? null);

  const activeExec = useMemo(
    () => (instance ? findActive(instance.executions) : null),
    [instance],
  );

  useEffect(() => {
    manualSelectRef.current = false;
    setSelectedExecId(null);
    pendingInitialStepRef.current = initialStepId ?? null;
  }, [instanceId, initialStepId]);

  useEffect(() => {
    if (!instance) {
      setSelectedExecId(null);
      manualSelectRef.current = false;
      return;
    }
    if (pendingInitialStepRef.current) {
      const pending = pendingInitialStepRef.current;
      const exec = findLatestExecForStep(instance.executions, pending);
      pendingInitialStepRef.current = null;
      if (exec) {
        manualSelectRef.current = true;
        setSelectedExecId(exec.id);
        return;
      }
    }
    if (!manualSelectRef.current && activeExec) {
      setSelectedExecId(activeExec.id);
    } else if (
      selectedExecId &&
      !instance.executions.some((e) => e.id === selectedExecId)
    ) {
      setSelectedExecId(activeExec?.id ?? null);
    }
  }, [instance, activeExec, selectedExecId]);

  const selected = useMemo(
    () =>
      instance
        ? instance.executions.find((e) => e.id === selectedExecId) ??
          activeExec
        : null,
    [instance, selectedExecId, activeExec],
  );

  const stepExecutions = useMemo(
    () =>
      instance && selected
        ? instance.executions.filter((e) => e.stepId === selected.stepId)
        : [],
    [instance, selected],
  );

  const handleSelectExec = useCallback((id: string) => {
    manualSelectRef.current = true;
    setSelectedExecId(id);
  }, []);

  const handleSelectStep = useCallback(
    (stepId: string) => {
      if (!instance) return;
      const exec = findLatestExecForStep(instance.executions, stepId);
      if (exec) {
        manualSelectRef.current = true;
        setSelectedExecId(exec.id);
      }
    },
    [instance],
  );

  const loopTargetStepId = findLoopTarget(template, selected?.stepId);

  const showHumanGate =
    !!selected &&
    selected.status === "awaitingHuman" &&
    selected.id === activeExec?.id;

  const selectedKind = findStepKind(template, selected?.stepId);
  const isLlmSessionKind =
    selectedKind === "claude_code.invoke" || selectedKind === "codex.invoke";

  const pastExecutions = useMemo(
    () =>
      selected && isLlmSessionKind && instance
        ? instance.executions
            .filter(
              (e) =>
                e.stepId === selected.stepId &&
                e.status === "looped" &&
                e.id !== selected.id,
            )
            .map((e) => ({ exec: e, events: sessions[e.id] ?? [] }))
        : [],
    [selected, isLlmSessionKind, instance, sessions],
  );

  const stepName = useMemo(
    () =>
      template?.steps.find((s) => s.id === selected?.stepId)?.name ??
      selected?.stepId ??
      "",
    [template, selected],
  );

  const handleValidate = useCallback(() => {
    if (selected) validateStep(selected.id);
  }, [selected, validateStep]);

  const handleRequestAdjustments = useCallback(() => {
    if (selected)
      wb.openEditor(reviewUriFor(instanceId, selected.id), { focus: true });
  }, [wb, instanceId, selected]);

  const handleRerunFromNode = useCallback(
    (stepExecId: string) => {
      void rerunFromNode(stepExecId);
    },
    [rerunFromNode],
  );

  const rerunImpactCount = useCallback(
    (stepId: string) => countDownstream(template, stepId),
    [template],
  );

  const contextValue = useMemo<RunPanelContextValue | null>(
    () =>
      instance
        ? {
            template,
            instance,
            selected,
            activeExec,
            stepExecutions,
            sessions,
            pastExecutions,
            manualSelect: manualSelectRef.current,
            isLlmSessionKind,
            showHumanGate,
            loopTargetStepId,
            stepName,
            error,
            onSelectStep: handleSelectStep,
            onSelectExec: handleSelectExec,
            onValidate: handleValidate,
            onRequestAdjustments: handleRequestAdjustments,
            onRerunFromNode: handleRerunFromNode,
            rerunImpactCount,
            loadSession,
          }
        : null,
    [
      template,
      instance,
      selected,
      activeExec,
      stepExecutions,
      sessions,
      pastExecutions,
      isLlmSessionKind,
      showHumanGate,
      loopTargetStepId,
      stepName,
      error,
      handleSelectStep,
      handleSelectExec,
      handleValidate,
      handleRequestAdjustments,
      handleRerunFromNode,
      rerunImpactCount,
      loadSession,
    ],
  );

  return {
    contextValue,
    loading,
    error,
    instanceMissing: !loading && instance === null,
  };
};

export default useRunPanelData;
