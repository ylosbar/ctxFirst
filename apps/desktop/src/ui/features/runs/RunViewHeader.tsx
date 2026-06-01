import { Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useT } from "@/ui/i18n";

type Props = {
  readonly templateRef: string | null;
  readonly onOpenInEditor: (() => void) | null;
  readonly onExport: (() => void) | null;
};

const RunViewHeader = ({
  templateRef,
  onOpenInEditor,
  onExport,
}: Props) => {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span>{t("runs.viewHeader.label")}</span>
        {templateRef ? (
          <>
            <span className="text-muted-foreground/40">
              {t("runs.viewHeader.separator")}
            </span>
            <span
              className="truncate font-mono text-foreground"
              title={templateRef}
            >
              {templateRef}
            </span>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {onExport ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={onExport}
                  aria-label={t("runs.viewHeader.exportLabel")}
                >
                  <Download className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>{t("runs.viewHeader.exportTooltip")}</TooltipContent>
          </Tooltip>
        ) : null}
        {onOpenInEditor ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={onOpenInEditor}
                  aria-label={t("runs.viewHeader.openInEditorLabel")}
                >
                  <Pencil className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>
              {t("runs.viewHeader.openInEditorTooltip")}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
};

export default RunViewHeader;
