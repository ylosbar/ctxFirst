import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  readonly side: "left" | "right";
  readonly onExpand: () => void;
  readonly label: string;
};

const SidebarCollapsedRail = ({ side, onExpand, label }: Props) => {
  const Icon = side === "left" ? PanelLeftOpen : PanelRightOpen;
  const tooltipLabel = `Afficher ${label}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            aria-label={tooltipLabel}
            onClick={onExpand}
            className={cn(
              "h-full w-full items-start justify-center rounded-none bg-sidebar pt-2 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              side === "left" ? "border-r" : "border-l",
            )}
          >
            <Icon className="size-3.5" />
          </Button>
        }
      />
      <TooltipContent side={side === "left" ? "right" : "left"}>
        {tooltipLabel}
      </TooltipContent>
    </Tooltip>
  );
};

export default SidebarCollapsedRail;
