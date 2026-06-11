import type {
  TimelineIterationNode,
  TimelineLoopNode,
  TimelineRow,
} from "../../timeline-types";

/** Flattened render descriptor — the visible tree, honouring the collapse set. */
export type RenderItem =
  | { readonly kind: "step"; readonly row: TimelineRow; readonly depth: number }
  | {
      readonly kind: "loopHeader";
      readonly loop: TimelineLoopNode;
      readonly depth: number;
    }
  | {
      readonly kind: "iterationHeader";
      readonly iteration: TimelineIterationNode;
      readonly depth: number;
    }
  | {
      readonly kind: "subworkflowHeader";
      /** Top-level `workflow.call` id that namespaced the inlined steps. */
      readonly prefix: string;
      readonly depth: number;
      readonly count: number;
    };

/** Collapse-set key for a sub-workflow group keyed by its call prefix. */
export const subKey = (prefix: string): string => `sub:${prefix}`;

/** Stable reconciliation key for a flattened render item. */
export const renderItemKey = (item: RenderItem): string => {
  switch (item.kind) {
    case "step":
      return item.row.stepExecId;
    case "loopHeader":
      return `loop-${item.loop.loopStepId}`;
    case "iterationHeader":
      return `iter-${item.iteration.iterationKey}`;
    case "subworkflowHeader":
      return `sub-${item.prefix}`;
  }
};

/**
 * Per-kind height estimate (px) for the virtualizer — refined by real
 * measurement after mount. A step bundles its trailing gaps, so its estimate
 * leans slightly high to limit scrollbar drift before measure.
 */
export const estimateRenderItem = (item: RenderItem): number => {
  switch (item.kind) {
    case "step":
      return 44;
    case "loopHeader":
      return 40;
    case "iterationHeader":
    case "subworkflowHeader":
      return 30;
  }
};

/** Headers pin while their section scrolls; steps don't. */
export const isStickyRenderItem = (item: RenderItem): boolean => item.kind !== "step";

/** Nesting depth drives the stack of pinned ancestors (loop › iteration › …). */
export const renderItemDepth = (item: RenderItem): number => item.depth;

/**
 * Top-level namespace prefix of a flattened step id, or `null` when the step is
 * host-local. Inlined sub-workflow steps carry `callId/originalId`
 * (`sub-template-expand.md` §3); the leading segment is the originating
 * `workflow.call`.
 */
export const stepNamespacePrefix = (stepId: string): string | null => {
  const slash = stepId.indexOf("/");
  return slash > 0 ? stepId.slice(0, slash) : null;
};
