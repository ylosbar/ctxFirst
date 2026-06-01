import { Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  readonly templateRef: string | null;
  readonly onOpenInEditor: (() => void) | null;
  readonly onExport: (() => void) | null;
};

const RunViewHeader = ({
  templateRef,
  onOpenInEditor,
  onExport,
}: Props) => (
  <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span>Run</span>
      {templateRef ? (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="truncate font-mono text-foreground" title={templateRef}>
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
                aria-label="Exporter"
              >
                <Download className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>
            Exporter tout le run en JSON (events, artifacts, sessions LLM…)
          </TooltipContent>
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
                aria-label="Ouvrir en édition"
              >
                <Pencil className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>
            Ouvrir le template en édition (nouvel onglet)
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  </div>
);

export default RunViewHeader;
