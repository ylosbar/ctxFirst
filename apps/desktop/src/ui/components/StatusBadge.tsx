import { Badge, type BadgeProps } from "../../components/ui/badge";
import type {
  InstanceStatus,
  StepExecStatus,
} from "../../domain/workflow/types";
import { cn } from "@/lib/utils";

export type WorkflowStatus = InstanceStatus | StepExecStatus;

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  pending: "En attente",
  running: "En cours",
  awaitingHuman: "Attente validation",
  awaitingChild: "Attente sous-workflow",
  validated: "Validée",
  completed: "Terminée",
  looped: "Rebouclée",
  failed: "Échouée",
  skipped: "Ignorée",
};

const STATUS_TONE: Record<WorkflowStatus, NonNullable<BadgeProps["tone"]>> = {
  pending: "neutral",
  running: "info",
  awaitingHuman: "warning",
  awaitingChild: "warning",
  validated: "success",
  completed: "success",
  looped: "accent",
  failed: "danger",
  skipped: "neutral",
};

type Props = {
  status: WorkflowStatus;
  className?: string;
};

const StatusBadge = ({ status, className }: Props) => {
  return (
    <Badge
      tone={STATUS_TONE[status]}
      className={cn(
        (status === "awaitingHuman" || status === "awaitingChild") &&
          "animate-pulse-ring",
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
};

export default StatusBadge;
export {
  STATUS_LABEL as WORKFLOW_STATUS_LABEL,
  STATUS_TONE as WORKFLOW_STATUS_TONE,
};
