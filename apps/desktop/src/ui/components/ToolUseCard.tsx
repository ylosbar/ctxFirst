import type { ToolUseTurn } from "../../domain/chat";
import { Badge } from "@/components/ui/badge";
import { ExpandableCard } from "@/components/ui/expandable-card";
import JsonView from "./JsonView";
import UsageBadge from "./UsageBadge";

const ToolUseCard = ({
  turn,
  defaultExpanded = false,
  compact = false,
}: {
  turn: ToolUseTurn;
  defaultExpanded?: boolean;
  compact?: boolean;
}) => {
  return (
    <ExpandableCard
      accent="accent"
      defaultExpanded={defaultExpanded}
      maxBodyHeight={400}
      compact={compact}
      header={
        <>
          <Badge tone="accent" size="sm">tool_use</Badge>
          <span className="font-mono font-semibold">{turn.name}</span>
          {turn.usage && <UsageBadge usage={turn.usage} className="ml-2" />}
          <span className="ml-auto font-mono text-2xs text-muted-foreground">
            {turn.id}
          </span>
        </>
      }
    >
      <JsonView value={turn.input} />
    </ExpandableCard>
  );
};

export default ToolUseCard;
