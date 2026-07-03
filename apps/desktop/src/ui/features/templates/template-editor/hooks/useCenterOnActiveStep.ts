import { useEffect } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

type Params = {
  /** True only in view-run mode — the effect is a no-op otherwise. */
  readonly isViewRun: boolean;
  /**
   * Step id of the currently active execution (from `RunOverlay.activeStepId`),
   * or `null`. Changing this value is what triggers a re-center.
   */
  readonly activeStepId: string | null;
  readonly rf: ReactFlowInstance;
};

/**
 * View-run mode: keep the ReactFlow viewport centered on the active step node.
 *
 * Re-centers whenever the active step changes (the run advances, a human gate
 * opens, a loop re-enters a different step), keeping the user's current zoom
 * (fitView clamped to the live zoom on both ends). It only fires on an
 * active-step *transition*, never on every viewport move, so a manual pan/zoom
 * is never yanked back mid-inspection — the view re-centers only when the run
 * itself moves to another node.
 */
export const useCenterOnActiveStep = ({
  isViewRun,
  activeStepId,
  rf,
}: Params): void => {
  useEffect(() => {
    if (!isViewRun || activeStepId === null) return;
    // Defer a frame so a freshly-mounted / just-updated node is measured before
    // ReactFlow computes its bounds; otherwise the first center can land on an
    // unsized node.
    const raf = requestAnimationFrame(() => {
      if (!rf.getNode(activeStepId)) return;
      const zoom = rf.getZoom();
      void rf.fitView({
        nodes: [{ id: activeStepId }],
        duration: 450,
        minZoom: zoom,
        maxZoom: zoom,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [isViewRun, activeStepId, rf]);
};
