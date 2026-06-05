/**
 * Canonical visual tokens for workflow step status. Status colors live HERE
 * (alongside badge.tsx / expandable-card.tsx) so the design-system phase-2
 * invariant "no status color class outside the design system" holds under
 * grep — feature code consumes these tables instead of re-declaring Tailwind
 * color classes.
 */
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  MinusCircle,
  RotateCw,
  UserCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react"

import type {
  InstanceStatus,
  StepExecStatus,
} from "../../domain/workflow/types"

export type StepStatus = StepExecStatus | "idle"

export type StatusStyle = {
  border: string
  bar: string
  dot: string
  text: string
  badgeBg: string
  iconBg: string
  iconText: string
}

export const STATUS_STYLE: Record<StepStatus, StatusStyle> = {
  idle: {
    border: "border-border/60",
    bar: "bg-muted-foreground/20",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
    badgeBg: "bg-muted/60",
    iconBg: "bg-muted/60",
    iconText: "text-muted-foreground",
  },
  pending: {
    border: "border-border/60",
    bar: "bg-muted-foreground/20",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
    badgeBg: "bg-muted/60",
    iconBg: "bg-muted/60",
    iconText: "text-muted-foreground",
  },
  running: {
    border: "border-blue-500/60",
    bar: "bg-blue-500",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    badgeBg: "bg-blue-500/10",
    iconBg: "bg-blue-500/15",
    iconText: "text-blue-600 dark:text-blue-400",
  },
  awaitingHuman: {
    border: "border-amber-500/60",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-500/10",
    iconBg: "bg-amber-500/15",
    iconText: "text-amber-600 dark:text-amber-400",
  },
  // A `template.invoke` step waiting on its spawned child instance. Same
  // "blocked / waiting" amber palette as awaitingHuman — distinguished only by
  // its icon and label (a sub-workflow is in flight, not a human).
  awaitingChild: {
    border: "border-amber-500/60",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-500/10",
    iconBg: "bg-amber-500/15",
    iconText: "text-amber-600 dark:text-amber-400",
  },
  validated: {
    border: "border-emerald-500/50",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    badgeBg: "bg-emerald-500/10",
    iconBg: "bg-emerald-500/15",
    iconText: "text-emerald-600 dark:text-emerald-400",
  },
  looped: {
    border: "border-purple-500/50",
    bar: "bg-purple-500",
    dot: "bg-purple-500",
    text: "text-purple-600 dark:text-purple-400",
    badgeBg: "bg-purple-500/10",
    iconBg: "bg-purple-500/15",
    iconText: "text-purple-600 dark:text-purple-400",
  },
  failed: {
    border: "border-destructive/60",
    bar: "bg-destructive",
    dot: "bg-destructive",
    text: "text-destructive",
    badgeBg: "bg-destructive/10",
    iconBg: "bg-destructive/15",
    iconText: "text-destructive",
  },
  skipped: {
    border: "border-dashed border-muted-foreground/40",
    bar: "bg-muted-foreground/30",
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    badgeBg: "bg-muted/40",
    iconBg: "bg-muted/40",
    iconText: "text-muted-foreground",
  },
  // Replaced by a rewind & replay — kept in the timeline for audit, rendered
  // muted/dashed (like skipped) so the fresh exec stands out.
  superseded: {
    border: "border-dashed border-muted-foreground/30",
    bar: "bg-muted-foreground/20",
    dot: "bg-muted-foreground/30",
    text: "text-muted-foreground",
    badgeBg: "bg-muted/40",
    iconBg: "bg-muted/40",
    iconText: "text-muted-foreground",
  },
}

export const STATUS_LABEL: Record<StepStatus, string> = {
  idle: "En attente",
  pending: "En attente",
  running: "En cours",
  awaitingHuman: "Attente validation",
  awaitingChild: "Attente sous-workflow",
  validated: "Validée",
  looped: "Rebouclée",
  failed: "Échouée",
  skipped: "Ignorée",
  superseded: "Remplacée",
}

export const STATUS_ICON: Record<StepStatus, LucideIcon> = {
  idle: Clock,
  pending: Clock,
  running: Loader2,
  awaitingHuman: UserCheck,
  awaitingChild: Workflow,
  validated: CheckCircle2,
  looped: RotateCw,
  failed: AlertCircle,
  skipped: MinusCircle,
  superseded: RotateCw,
}

export type RunStatusStyle = {
  bar: string
  dot: string
  text: string
  iconBg: string
  pulse: boolean
}

export const RUN_STATUS_STYLE: Record<InstanceStatus, RunStatusStyle> = {
  running: {
    bar: "bg-blue-500",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-500/15",
    pulse: true,
  },
  awaitingHuman: {
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/15",
    pulse: true,
  },
  completed: {
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/15",
    pulse: false,
  },
  failed: {
    bar: "bg-destructive",
    dot: "bg-destructive",
    text: "text-destructive",
    iconBg: "bg-destructive/15",
    pulse: false,
  },
}

export const RUN_STATUS_LABEL: Record<InstanceStatus, string> = {
  running: "En cours",
  awaitingHuman: "Attente validation",
  completed: "Terminée",
  failed: "Échouée",
}

export type DiffStatus = "added" | "removed" | "hunk"

export const DIFF_STATUS_STYLE: Record<DiffStatus, string> = {
  added: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  removed: "bg-destructive/15 text-destructive",
  hunk: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
}
