import { cn } from "@/lib/utils";
import { useT } from "../../../../i18n";
import EdgeDropSuggestions from "../../../../components/templates/EdgeDropSuggestions";
import TemplateInspectorView from "../../TemplateInspectorView";
import type { GroupToolsControls } from "../hooks/useGroupTools";
import type { EdgeDropControls } from "../hooks/useEdgeDropSuggestions";
import type { InspectorResizeControls } from "../hooks/useInspectorResize";

type Props = {
  readonly isViewRun: boolean;
  readonly groupDrawingMode: boolean;
  readonly onOverlayPointerDown: GroupToolsControls["onOverlayPointerDown"];
  readonly onOverlayPointerMove: GroupToolsControls["onOverlayPointerMove"];
  readonly onOverlayPointerUp: GroupToolsControls["onOverlayPointerUp"];
  readonly layoutSaveError: string | null;
  readonly pendingConnect: EdgeDropControls["pendingConnect"];
  readonly suggestions: EdgeDropControls["suggestions"];
  readonly handleSuggestionPick: EdgeDropControls["handleSuggestionPick"];
  readonly setPendingConnect: EdgeDropControls["setPendingConnect"];
  readonly selectedNodeId: string | null;
  readonly selectedEdgeId: string | null;
  readonly inspectorWidth: number;
  readonly inspectorDragWidth: number | null;
  readonly onInspectorResizeStart: InspectorResizeControls["onInspectorResizeStart"];
  readonly onInspectorResizeMove: InspectorResizeControls["onInspectorResizeMove"];
  readonly onInspectorResizeEnd: InspectorResizeControls["onInspectorResizeEnd"];
};

const TemplateCanvasOverlays = ({
  isViewRun,
  groupDrawingMode,
  onOverlayPointerDown,
  onOverlayPointerMove,
  onOverlayPointerUp,
  layoutSaveError,
  pendingConnect,
  suggestions,
  handleSuggestionPick,
  setPendingConnect,
  selectedNodeId,
  selectedEdgeId,
  inspectorWidth,
  inspectorDragWidth,
  onInspectorResizeStart,
  onInspectorResizeMove,
  onInspectorResizeEnd,
}: Props) => {
  const t = useT();
  return (
    <>
      {groupDrawingMode ? (
        <div
          className="absolute inset-0 z-10 cursor-crosshair"
          onPointerDown={onOverlayPointerDown}
          onPointerMove={onOverlayPointerMove}
          onPointerUp={onOverlayPointerUp}
          onPointerCancel={onOverlayPointerUp}
        />
      ) : null}
      {layoutSaveError ? (
        <div
          className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm"
          title={layoutSaveError}
        >
          {t("template.editor.layoutSaveError")}
        </div>
      ) : null}
      {pendingConnect ? (
        <EdgeDropSuggestions
          position={pendingConnect.popupPos}
          suggestions={suggestions}
          onSelect={handleSuggestionPick}
          onClose={() => setPendingConnect(null)}
        />
      ) : null}
      {!isViewRun && (selectedNodeId !== null || selectedEdgeId !== null) ? (
        <div
          className={cn(
            "absolute right-2 top-2 bottom-2 z-20",
            "flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-150",
          )}
          style={{ width: inspectorWidth }}
          data-template-editor
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("template.editor.inspector.resizeAriaLabel")}
            className={cn(
              "absolute left-0 top-0 bottom-0 z-10 w-1.5 cursor-ew-resize",
              "transition-colors hover:bg-primary/30",
              inspectorDragWidth !== null && "bg-primary/40",
            )}
            onPointerDown={onInspectorResizeStart}
            onPointerMove={onInspectorResizeMove}
            onPointerUp={onInspectorResizeEnd}
            onPointerCancel={onInspectorResizeEnd}
          />
          <TemplateInspectorView />
        </div>
      ) : null}
    </>
  );
};

export default TemplateCanvasOverlays;
