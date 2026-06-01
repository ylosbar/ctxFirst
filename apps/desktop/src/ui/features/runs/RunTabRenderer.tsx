import { Cog, Loader2, Pin, PinOff, X } from "lucide-react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/ui/i18n";
import {
  RUN_STATUS_LABEL,
  RUN_STATUS_STYLE,
} from "@/components/ui/step-status";
import type {
  InstanceStatus,
  InstanceSummaryView,
} from "../../../domain/workflow/types";
import { useWorkbench } from "../../workbench/WorkbenchProvider";
import type { EditorTabProps } from "../../workbench/types";
import { instanceIdFromRunUri, runUriFor, RUN_URI_PREFIX } from "./run-uri";
import {
  useInstancesById,
  usePinRun,
  usePinnedIds,
  useUnpinRun,
} from "../../stores/runs-store";
import { KIND_ICON_COLOR } from "../explorer/build-tree";

const formatLabel = (
  instanceId: string,
  summary: InstanceSummaryView | undefined,
): string => {
  if (!summary) return instanceId.slice(0, 8);
  return `${summary.templateId} · ${summary.id.slice(0, 6)}`;
};

const RunLeading = ({ status }: { status: InstanceStatus }) => {
  const style = RUN_STATUS_STYLE[status];
  const icon = (
    <span
      aria-hidden
      className="relative flex size-3.5 shrink-0 items-center justify-center"
    >
      <Cog className={cn("size-3.5", KIND_ICON_COLOR.runs)} />
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background",
          style.dot,
          style.pulse && "animate-pulse",
        )}
      />
    </span>
  );
  if (status !== "running") return icon;
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-1">
      <Loader2 className={cn("size-3 animate-spin", style.text)} />
      {icon}
    </span>
  );
};

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground";

const popupClass =
  "z-50 min-w-44 overflow-hidden rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none";

const RunTabRenderer = (props: EditorTabProps) => {
  const t = useT();
  const { api, params } = props;
  const { uri } = params;
  const wb = useWorkbench();
  const instancesById = useInstancesById();
  const pinnedIds = usePinnedIds();
  const pinRun = usePinRun();
  const unpinRun = useUnpinRun();

  const instanceId = instanceIdFromRunUri(uri);
  if (!instanceId) {
    return (
      <div className="flex h-full items-center px-3 text-xs">{uri}</div>
    );
  }

  const summary = instancesById.get(instanceId);
  const isPinned = pinnedIds.has(instanceId);
  const status = summary?.status;
  const label = formatLabel(instanceId, summary);
  const fullTitle = summary
    ? `${summary.templateId}@${summary.templateVersion} · ${summary.id}`
    : instanceId;

  const handleClose = (event: React.MouseEvent) => {
    event.stopPropagation();
    api.close();
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1 && !isPinned) {
      event.preventDefault();
      api.close();
    }
  };

  const closeOthers = () => {
    for (const editor of wb.listEditors()) {
      if (editor.uri === uri) continue;
      const otherId = instanceIdFromRunUri(editor.uri);
      if (!otherId) continue;
      if (pinnedIds.has(otherId)) continue;
      wb.closeEditor(editor.uri);
    }
  };

  const closeAllRuns = () => {
    for (const editor of wb.listEditors()) {
      if (!editor.uri.startsWith(RUN_URI_PREFIX)) continue;
      const id = instanceIdFromRunUri(editor.uri);
      if (!id || pinnedIds.has(id)) continue;
      wb.closeEditor(editor.uri);
    }
  };

  const leading = status ? (
    <RunLeading status={status} />
  ) : (
    <Cog
      aria-hidden
      className={cn("size-3.5 shrink-0", KIND_ICON_COLOR.runs)}
    />
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        className="group flex h-full items-center gap-2 px-3"
        onMouseDown={handleMouseDown}
        title={`${fullTitle}${status ? ` — ${RUN_STATUS_LABEL[status]}` : ""}`}
      >
        {leading}
        <span className="truncate text-xs">{label}</span>
        {isPinned ? (
          <Pin className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("runs.tabRenderer.closeTab")}
            onClick={handleClose}
            className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 [&_svg]:size-3"
          >
            <X />
          </Button>
        )}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner sideOffset={4} className="z-50">
          <ContextMenu.Popup className={popupClass}>
            {isPinned ? (
              <Menu.Item
                className={itemClass}
                onClick={() => unpinRun(instanceId)}
              >
                <PinOff className="size-4" />
                {t("runs.tabRenderer.unpin")}
              </Menu.Item>
            ) : (
              <Menu.Item
                className={itemClass}
                onClick={() => pinRun(instanceId)}
              >
                <Pin className="size-4" />
                {t("runs.tabRenderer.pin")}
              </Menu.Item>
            )}
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <Menu.Item
              className={itemClass}
              disabled={isPinned}
              onClick={() => wb.closeEditor(runUriFor(instanceId))}
            >
              <X className="size-4" />
              {t("common.close")}
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={closeOthers}>
              {t("runs.tabRenderer.closeOthers")}
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={closeAllRuns}>
              {t("runs.tabRenderer.closeAll")}
            </Menu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

export default RunTabRenderer;
