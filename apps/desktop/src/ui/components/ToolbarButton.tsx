import { type ComponentType } from "react";
import { type LucideProps } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const ToolbarButton = ({
  icon: IconCmp,
  label,
  onClick,
  className,
  size = "icon-sm",
  variant = "ghost",
  disabled,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  onClick?: () => void;
  className?: string;
  size?: "icon-xs" | "icon-sm" | "icon" | "icon-lg";
  variant?: "ghost" | "default" | "outline" | "secondary" | "destructive";
  disabled?: boolean;
}) => {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={variant}
            size={size}
            onClick={onClick}
            aria-label={label}
            disabled={disabled}
            className={cn(
              variant === "ghost" &&
                "text-muted-foreground hover:text-foreground",
              className,
            )}
          >
            <IconCmp />
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};

export default ToolbarButton;
