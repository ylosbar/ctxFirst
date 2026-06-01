import type { ToolResultTurn } from "../../domain/chat";
import { Badge } from "@/components/ui/badge";
import { ExpandableCard } from "@/components/ui/expandable-card";
import JsonView from "./JsonView";

const ToolResultCard = ({
  turn,
  defaultExpanded = false,
  compact = false,
}: {
  turn: ToolResultTurn;
  defaultExpanded?: boolean;
  compact?: boolean;
}) => {
  return (
    <ExpandableCard
      accent={turn.is_error ? "destructive" : "success"}
      defaultExpanded={defaultExpanded}
      maxBodyHeight={400}
      compact={compact}
      header={
        <>
          <Badge tone={turn.is_error ? "danger" : "success"} size="sm">
            tool_result
          </Badge>
          <span className="font-mono text-2xs text-muted-foreground">
            {turn.tool_use_id}
          </span>
          {turn.is_error && (
            <span className="ml-auto font-mono text-2xs font-semibold text-destructive">
              error
            </span>
          )}
        </>
      }
    >
      <JsonView value={turn.content} />
    </ExpandableCard>
  );
};

export default ToolResultCard;
