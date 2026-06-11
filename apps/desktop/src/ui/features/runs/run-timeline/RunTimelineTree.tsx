import VirtualList from "@/components/ui/virtual-list";
import { useWorkbench } from "../../../workbench/WorkbenchProvider";
import { useT } from "../../../i18n";
import type { buildTimeline } from "../build-timeline";
import { runUriFor } from "../run-uri";
import type { TimelineRow } from "../timeline-types";
import RunViewHeader from "../RunViewHeader";
import {
  estimateRenderItem,
  isStickyRenderItem,
  type RenderItem,
  renderItemDepth,
  renderItemKey,
  subKey,
} from "./parts/render-item";
import { useTimelineCollapse } from "./hooks/useTimelineCollapse";
import TimelineRowItem from "./components/TimelineRowItem";
import LoopHeaderItem from "./components/LoopHeaderItem";
import IterationHeaderItem from "./components/IterationHeaderItem";
import SubworkflowHeaderItem from "./components/SubworkflowHeaderItem";
import TimelineGapItem from "./components/TimelineGapItem";
import SkippedFooter from "./components/SkippedFooter";

type RunTimelineTreeProps = {
  readonly model: NonNullable<ReturnType<typeof buildTimeline>>;
  readonly templateRef: string;
  readonly selectedExecId: string | null;
  readonly onSelectExec: (stepExecId: string) => void;
  readonly onSelectStep: (stepId: string) => void;
  readonly onRerun: (row: TimelineRow) => void;
  readonly onOpenInEditor: () => void;
  readonly onExport: () => void;
};

const RunTimelineTree = ({
  model,
  templateRef,
  selectedExecId,
  onSelectExec,
  onSelectStep,
  onRerun,
  onOpenInEditor,
  onExport,
}: RunTimelineTreeProps) => {
  const t = useT();
  const wb = useWorkbench();
  const {
    collapsed,
    toggle,
    toggleAll,
    allCollapsed,
    collapsibleKeys,
    items,
    gapsByExecId,
  } = useTimelineCollapse(model);

  // Renders one flattened item. Absolutely-positioned virtual rows leave the
  // normal flow, so the former `<ol>`'s `divide-y` no longer draws separators —
  // each virtual row carries its own `border-b`. A step bundles its trailing
  // gaps into the same row so they measure as one unit.
  const renderRow = (item: RenderItem): React.ReactNode => {
    let content: React.ReactNode;
    switch (item.kind) {
      case "loopHeader":
        content = (
          <LoopHeaderItem
            loop={item.loop}
            depth={item.depth}
            collapsed={collapsed.has(item.loop.loopStepId)}
            isSelected={item.loop.foreach.stepExecId === selectedExecId}
            onToggle={() => toggle(item.loop.loopStepId)}
            onSelect={() => onSelectExec(item.loop.foreach.stepExecId)}
          />
        );
        break;
      case "iterationHeader":
        content = (
          <IterationHeaderItem
            iteration={item.iteration}
            depth={item.depth}
            collapsed={collapsed.has(item.iteration.iterationKey)}
            onToggle={() => toggle(item.iteration.iterationKey)}
          />
        );
        break;
      case "subworkflowHeader":
        content = (
          <SubworkflowHeaderItem
            prefix={item.prefix}
            count={item.count}
            depth={item.depth}
            collapsed={collapsed.has(subKey(item.prefix))}
            onToggle={() => toggle(subKey(item.prefix))}
          />
        );
        break;
      case "step": {
        const gapsAfter = gapsByExecId.get(item.row.stepExecId) ?? [];
        content = (
          <>
            <TimelineRowItem
              row={item.row}
              depth={item.depth}
              isSelected={item.row.stepExecId === selectedExecId}
              onClick={() => onSelectExec(item.row.stepExecId)}
              onRerun={() => onRerun(item.row)}
              onOpenChild={(childId) =>
                wb.openEditor(runUriFor(childId), { focus: true })
              }
            />
            {gapsAfter.map((gap, gi) => (
              <TimelineGapItem
                key={`gap-${item.row.stepExecId}-${gi}`}
                gap={gap}
                depth={item.depth}
              />
            ))}
          </>
        );
        break;
      }
    }
    return <div className="border-b border-border/60">{content}</div>;
  };

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
      <VirtualList
        as="ol"
        className="min-h-0 flex-1"
        ariaLabel={t("runs.timeline.ariaLabel")}
        items={items}
        getKey={renderItemKey}
        estimateSize={estimateRenderItem}
        isSticky={isStickyRenderItem}
        rowDepth={renderItemDepth}
        renderItem={renderRow}
        footer={
          model.skipped.length > 0 ? (
            <SkippedFooter skipped={model.skipped} onSelect={onSelectStep} />
          ) : null
        }
      />
    </div>
  );
};

export default RunTimelineTree;
