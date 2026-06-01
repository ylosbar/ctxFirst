import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Hourglass,
  Repeat,
  RotateCw,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  STATUS_LABEL,
  STATUS_STYLE,
} from "@/components/ui/step-status";
import type { StepExecStatus } from "../../../domain/workflow/types";
import { useServices } from "../../di/services-provider";
import { useRunPanelContext } from "../../stores/run-panel-store";
import { useWorkbench } from "../../workbench/WorkbenchProvider";
import { useT } from "../../i18n";
import { templateUriFor } from "../templates/template-uri";
import { buildTimeline } from "./build-timeline";
import { formatDurationMs } from "./build-step-stats";
import type {
  TimelineGap,
  TimelineIterationNode,
  TimelineLoopNode,
  TimelineNode,
  TimelineRow,
  TimelineSkipped,
} from "./timeline-types";
import RunViewHeader from "./RunViewHeader";
import { useTickingNow } from "./useTickingNow";

const INDENT_BASE_REM = 0.75;
const INDENT_STEP_REM = 1.5;

const indentStyle = (depth: number, extra = 0): { paddingLeft: string } => ({
  paddingLeft: `${INDENT_BASE_REM + depth * INDENT_STEP_REM + extra}rem`,
});

/** Collect every collapsible key (loops + iterations) in render order. */
const collectCollapsibleKeys = (
  nodes: ReadonlyArray<TimelineNode>,
  out: string[],
): void => {
  for (const node of nodes) {
    if (node.kind === "loop") {
      out.push(node.loopStepId);
      collectCollapsibleKeys(node.iterations, out);
    } else if (node.kind === "iteration") {
      out.push(node.iterationKey);
      collectCollapsibleKeys(node.children, out);
    }
  }
};

const formatClock = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const RunTimelineView = () => {
  const ctx = useRunPanelContext();
  const wb = useWorkbench();
  const services = useServices();

  const tickInterval =
    ctx && (ctx.instance.status === "running" || ctx.instance.status === "awaitingHuman")
      ? 1000
      : null;
  const nowMs = useTickingNow(tickInterval);

  const model = useMemo(() => {
    if (!ctx) return null;
    return buildTimeline({
      instance: ctx.instance,
      template: ctx.template,
      nowMs,
    });
  }, [ctx, nowMs]);

  const instance = ctx?.instance ?? null;

  const handleOpenInEditor = useCallback(() => {
    if (!instance) return;
    const templateUri = templateUriFor(
      `${instance.templateId}@${instance.templateVersion}`,
    );
    wb.openEditor(templateUri, { focus: true });
  }, [wb, instance]);

  const handleExport = useCallback(async () => {
    if (!instance) return;
    try {
      const { path } = await services.exportRun(instance.id);
      if (path) {
        toast.success("Run exporté en JSON", { description: path });
      }
    } catch (e) {
      toast.error("Export impossible", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }, [services, instance]);

  useEffect(() => {
    if (ctx?.error) {
      toast.error(ctx.error);
    }
  }, [ctx?.error]);

  if (!ctx) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <RunViewHeader templateRef={null} onOpenInEditor={null} onExport={null} />
        <EmptyState description="Aucun run actif." />
      </div>
    );
  }

  const templateRef = `${ctx.instance.templateId}@${ctx.instance.templateVersion}`;
  const selectedExecId = ctx.selected?.id ?? null;

  if (!model || model.nodes.length === 0) {
    return (
      <div className="flex h-full min-w-0 flex-col">
        <RunViewHeader
          templateRef={templateRef}
          onOpenInEditor={handleOpenInEditor}
          onExport={() => void handleExport()}
        />
        <EmptyState description="Aucune étape exécutée pour l'instant." />
        {model && model.skipped.length > 0 ? (
          <SkippedFooter skipped={model.skipped} onSelect={ctx.onSelectStep} />
        ) : null}
      </div>
    );
  }

  return (
    <TimelineTree
      model={model}
      templateRef={templateRef}
      selectedExecId={selectedExecId}
      onSelectExec={ctx.onSelectExec}
      onSelectStep={ctx.onSelectStep}
      onOpenInEditor={handleOpenInEditor}
      onExport={() => void handleExport()}
    />
  );
};

// ── Tree rendering ──────────────────────────────────────────────────────────

type TimelineTreeProps = {
  readonly model: NonNullable<ReturnType<typeof buildTimeline>>;
  readonly templateRef: string;
  readonly selectedExecId: string | null;
  readonly onSelectExec: (stepExecId: string) => void;
  readonly onSelectStep: (stepId: string) => void;
  readonly onOpenInEditor: () => void;
  readonly onExport: () => void;
};

/** Flattened render descriptor — the visible tree, honouring the collapse set. */
type RenderItem =
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
const subKey = (prefix: string): string => `sub:${prefix}`;

/**
 * Top-level namespace prefix of a flattened step id, or `null` when the step is
 * host-local. Inlined sub-workflow steps carry `callId/originalId`
 * (`sub-template-expand.md` §3); the leading segment is the originating
 * `workflow.call`.
 */
const stepNamespacePrefix = (stepId: string): string | null => {
  const slash = stepId.indexOf("/");
  return slash > 0 ? stepId.slice(0, slash) : null;
};

/**
 * Wraps maximal runs of consecutive inlined step rows sharing a top-level
 * namespace prefix under a single collapsible `⊞ sub-workflow` header (§11c).
 * Renderer-only: the provenance is reconstructed purely from the namespaced
 * `stepId`, with no extra metadata. Non-step items (loop/iteration headers)
 * break a run.
 */
const groupSubworkflowRuns = (
  items: ReadonlyArray<RenderItem>,
  collapsed: ReadonlySet<string>,
): RenderItem[] => {
  const out: RenderItem[] = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    const prefix = it.kind === "step" ? stepNamespacePrefix(it.row.stepId) : null;
    if (it.kind === "step" && prefix) {
      let j = i;
      const members: RenderItem[] = [];
      while (j < items.length) {
        const m = items[j];
        if (m.kind !== "step" || stepNamespacePrefix(m.row.stepId) !== prefix) break;
        members.push(m);
        j++;
      }
      out.push({ kind: "subworkflowHeader", prefix, depth: it.depth, count: members.length });
      if (!collapsed.has(subKey(prefix))) {
        for (const m of members) {
          out.push({ ...m, depth: m.depth + 1 });
        }
      }
      i = j;
    } else {
      out.push(it);
      i++;
    }
  }
  return out;
};

const flattenNodes = (
  nodes: ReadonlyArray<TimelineNode>,
  depth: number,
  collapsed: ReadonlySet<string>,
  out: RenderItem[],
): void => {
  for (const node of nodes) {
    if (node.kind === "step") {
      out.push({ kind: "step", row: node.row, depth });
    } else if (node.kind === "loop") {
      out.push({ kind: "loopHeader", loop: node, depth });
      if (!collapsed.has(node.loopStepId)) {
        flattenNodes(node.iterations, depth + 1, collapsed, out);
      }
      // The collect row is the loop's closing bracket — always shown (when
      // reached), at the loop's own depth.
      if (node.collect) {
        out.push({ kind: "step", row: node.collect, depth });
      }
    } else {
      out.push({ kind: "iterationHeader", iteration: node, depth });
      if (!collapsed.has(node.iterationKey)) {
        flattenNodes(node.children, depth + 1, collapsed, out);
      }
    }
  }
};

const TimelineTree = ({
  model,
  templateRef,
  selectedExecId,
  onSelectExec,
  onSelectStep,
  onOpenInEditor,
  onExport,
}: TimelineTreeProps) => {
  const t = useT();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const collapsibleKeys = useMemo(() => {
    const out: string[] = [];
    collectCollapsibleKeys(model.nodes, out);
    // Sub-workflow groups are derived from the flattened step ids (not the
    // node tree), so collect their keys separately for "collapse all".
    const flat: RenderItem[] = [];
    flattenNodes(model.nodes, 0, new Set(), flat);
    const seen = new Set<string>();
    for (const it of flat) {
      if (it.kind !== "step") continue;
      const prefix = stepNamespacePrefix(it.row.stepId);
      if (prefix && !seen.has(prefix)) {
        seen.add(prefix);
        out.push(subKey(prefix));
      }
    }
    return out;
  }, [model.nodes]);

  const allCollapsed =
    collapsibleKeys.length > 0 &&
    collapsibleKeys.every((k) => collapsed.has(k));

  const toggleAll = useCallback(() => {
    setCollapsed(allCollapsed ? new Set() : new Set(collapsibleKeys));
  }, [allCollapsed, collapsibleKeys]);

  const items = useMemo(() => {
    const out: RenderItem[] = [];
    flattenNodes(model.nodes, 0, collapsed, out);
    return groupSubworkflowRuns(out, collapsed);
  }, [model.nodes, collapsed]);

  const gapsByExecId = useMemo(() => {
    const map = new Map<string, TimelineGap[]>();
    for (const gap of model.gaps) {
      const list = map.get(gap.afterStepExecId);
      if (list) list.push(gap);
      else map.set(gap.afterStepExecId, [gap]);
    }
    return map;
  }, [model.gaps]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <RunViewHeader
        templateRef={templateRef}
        onOpenInEditor={onOpenInEditor}
        onExport={onExport}
      />
      {collapsibleKeys.length > 0 ? (
        <div className="flex justify-end border-b border-border/60 px-3 py-1">
          <button
            type="button"
            onClick={toggleAll}
            className="text-2xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {allCollapsed
              ? t("runs.timeline.expandAll")
              : t("runs.timeline.collapseAll")}
          </button>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <ol className="divide-y divide-border/60">
          {items.map((item) => {
            if (item.kind === "loopHeader") {
              return (
                <LoopHeaderItem
                  key={`loop-${item.loop.loopStepId}`}
                  loop={item.loop}
                  depth={item.depth}
                  collapsed={collapsed.has(item.loop.loopStepId)}
                  isSelected={item.loop.foreach.stepExecId === selectedExecId}
                  onToggle={() => toggle(item.loop.loopStepId)}
                  onSelect={() =>
                    onSelectExec(item.loop.foreach.stepExecId)
                  }
                />
              );
            }
            if (item.kind === "iterationHeader") {
              return (
                <IterationHeaderItem
                  key={`iter-${item.iteration.iterationKey}`}
                  iteration={item.iteration}
                  depth={item.depth}
                  collapsed={collapsed.has(item.iteration.iterationKey)}
                  onToggle={() => toggle(item.iteration.iterationKey)}
                />
              );
            }
            if (item.kind === "subworkflowHeader") {
              return (
                <SubworkflowHeaderItem
                  key={`sub-${item.prefix}`}
                  prefix={item.prefix}
                  count={item.count}
                  depth={item.depth}
                  collapsed={collapsed.has(subKey(item.prefix))}
                  onToggle={() => toggle(subKey(item.prefix))}
                />
              );
            }
            const gapsAfter = gapsByExecId.get(item.row.stepExecId) ?? [];
            return (
              <Fragment key={item.row.stepExecId}>
                <TimelineRowItem
                  row={item.row}
                  depth={item.depth}
                  isSelected={item.row.stepExecId === selectedExecId}
                  onClick={() => onSelectExec(item.row.stepExecId)}
                />
                {gapsAfter.map((gap, gi) => (
                  <TimelineGapItem
                    key={`gap-${item.row.stepExecId}-${gi}`}
                    gap={gap}
                    depth={item.depth}
                  />
                ))}
              </Fragment>
            );
          })}
        </ol>
        {model.skipped.length > 0 ? (
          <SkippedFooter skipped={model.skipped} onSelect={onSelectStep} />
        ) : null}
      </ScrollArea>
    </div>
  );
};

type RowProps = {
  readonly row: TimelineRow;
  readonly depth: number;
  readonly isSelected: boolean;
  readonly onClick: () => void;
};

const TimelineRowItem = ({ row, depth, isSelected, onClick }: RowProps) => {
  const t = useT();
  const isRetry = row.retryOfStepExecId !== null;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-selected={isSelected}
        style={indentStyle(depth, isRetry ? INDENT_STEP_REM : 0)}
        className={cn(
          "flex w-full items-start gap-3 py-2 pr-3 text-left transition-colors",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          isSelected &&
            "bg-accent ring-1 ring-ring/40 ring-inset",
        )}
      >
        <StatusDot status={row.status} inProgress={row.inProgress} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            {isRetry ? (
              <RotateCw
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label="reprise"
              />
            ) : null}
            <span className="truncate text-foreground">
              {row.label}
            </span>
            {row.iterationIndex > 1 ? (
              <span className="text-2xs text-muted-foreground">
                {t("runs.timeline.iteration", { n: row.iterationIndex })}
              </span>
            ) : null}
            {row.hasHumanGate ? (
              <UserCheck
                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-label="attente humaine"
              />
            ) : null}
            <span
              className={cn(
                "ml-2 rounded px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide",
                STATUS_STYLE[row.status].badgeBg,
                STATUS_STYLE[row.status].text,
              )}
            >
              {STATUS_LABEL[row.status]}
            </span>
          </div>
          {row.hasError && row.errorMessage ? (
            <div className="mt-1 flex items-start gap-1.5 text-2xs text-destructive">
              <XCircle className="mt-px size-3 shrink-0" />
              <span className="truncate" title={row.errorMessage}>
                {row.errorMessage}
              </span>
            </div>
          ) : null}
          {row.feedbackSummary || row.feedbackCommentCount > 0 ? (
            <div
              className="mt-1 truncate text-2xs italic text-muted-foreground"
              title={row.feedbackSummary ?? undefined}
            >
              {row.feedbackSummary
                ? `« ${row.feedbackSummary} »`
                : t("runs.timeline.feedbackComments", {
                    count: row.feedbackCommentCount,
                  })}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-2xs text-muted-foreground tabular-nums">
          <span className={cn(row.inProgress && "text-blue-600 dark:text-blue-400")}>
            {formatDurationMs(row.durationMs)}
          </span>
          <span>{formatClock(row.startedAtMs)}</span>
        </div>
      </button>
    </li>
  );
};

type LoopHeaderProps = {
  readonly loop: TimelineLoopNode;
  readonly depth: number;
  readonly collapsed: boolean;
  readonly isSelected: boolean;
  readonly onToggle: () => void;
  readonly onSelect: () => void;
};

const LoopHeaderItem = ({
  loop,
  depth,
  collapsed,
  isSelected,
  onToggle,
  onSelect,
}: LoopHeaderProps) => {
  const t = useT();
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const inProgress = loop.collect === null;
  return (
    <li>
      <div
        style={indentStyle(depth)}
        className={cn(
          "flex w-full items-center gap-1.5 py-2 pr-3 transition-colors",
          "hover:bg-muted/40",
          isSelected && "bg-accent ring-1 ring-ring/40 ring-inset",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="-m-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Chevron className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onSelect}
          aria-selected={isSelected}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Repeat
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground",
              inProgress && "animate-pulse text-blue-600 dark:text-blue-400",
            )}
            aria-hidden
          />
          <span className="truncate text-foreground">{loop.foreach.label}</span>
          <span className="shrink-0 text-2xs text-muted-foreground">
            {"· "}
            {t("runs.timeline.loopIterationCount", {
              count: loop.iterations.length,
            })}
          </span>
        </button>
      </div>
    </li>
  );
};

type IterationHeaderProps = {
  readonly iteration: TimelineIterationNode;
  readonly depth: number;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
};

const IterationHeaderItem = ({
  iteration,
  depth,
  collapsed,
  onToggle,
}: IterationHeaderProps) => {
  const t = useT();
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        style={indentStyle(depth)}
        className="flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Chevron className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          {t("runs.timeline.iterationHeader", { index: iteration.index })}
        </span>
      </button>
    </li>
  );
};

type SubworkflowHeaderProps = {
  readonly prefix: string;
  readonly count: number;
  readonly depth: number;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
};

/**
 * Collapsible header for an inlined sub-workflow group (§11c). Collapsed by
 * default-able via the chevron; shows the originating `workflow.call` id and
 * the number of inlined steps. Indistinguishable from a native group at
 * runtime — purely a renderer-side provenance box.
 */
const SubworkflowHeaderItem = ({
  prefix,
  count,
  depth,
  collapsed,
  onToggle,
}: SubworkflowHeaderProps) => {
  const t = useT();
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <li>
      <div
        style={indentStyle(depth)}
        className="flex w-full items-center gap-1.5 py-1.5 pr-3 transition-colors hover:bg-muted/40"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="-m-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Chevron className="size-4" aria-hidden />
        </button>
        <Boxes className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-xs text-foreground">{`⊞ ${prefix}`}</span>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {`· ${t("runs.timeline.subworkflowStepCount", { count })}`}
        </span>
      </div>
    </li>
  );
};

const StatusDot = ({
  status,
  inProgress,
}: {
  readonly status: StepExecStatus;
  readonly inProgress: boolean;
}) => (
  <span
    className={cn(
      "mt-1.5 inline-block size-2.5 shrink-0 rounded-full",
      STATUS_STYLE[status].dot,
      inProgress && "animate-pulse",
    )}
    aria-hidden
  />
);

const TimelineGapItem = ({
  gap,
  depth,
}: {
  readonly gap: TimelineGap;
  readonly depth: number;
}) => {
  const Icon = gap.kind === "humanWait" ? Hourglass : null;
  return (
    <li
      style={indentStyle(depth, INDENT_STEP_REM)}
      className="flex items-center gap-2 py-1 pr-3 text-2xs text-muted-foreground"
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : <span>{"⋯"}</span>}
      <span>
        {gap.kind === "humanWait" ? "Attente humaine" : "Pause"}
        {" · "}
        {formatDurationMs(gap.durationMs)}
      </span>
    </li>
  );
};

const SkippedFooter = ({
  skipped,
  onSelect,
}: {
  readonly skipped: ReadonlyArray<TimelineSkipped>;
  readonly onSelect: (stepId: string) => void;
}) => {
  const t = useT();
  return (
  <details className="border-t bg-muted/20">
    <summary className="cursor-pointer select-none px-3 py-1.5 text-xs text-muted-foreground">
      {t("runs.skipped", { count: skipped.length })}
    </summary>
    <ul className="divide-y divide-border/40 pb-1">
      {skipped.map((s) => (
        <li key={s.stepId}>
          <button
            type="button"
            onClick={() => onSelect(s.stepId)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span
              className={cn(
                "inline-block size-2 shrink-0 rounded-full",
                STATUS_STYLE.skipped.dot,
              )}
              aria-hidden
            />
            <span className="truncate">{s.label}</span>
          </button>
        </li>
      ))}
    </ul>
  </details>
  );
};

export default RunTimelineView;
