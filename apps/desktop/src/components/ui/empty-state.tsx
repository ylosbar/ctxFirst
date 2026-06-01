import * as React from "react"
import { AlertCircle, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

// Centralise fonts / gap / icon-size par densité. `sm` = empty state compact
// affiché dans une liste ; `md` = plein cadre (défaut). La taille des icônes
// est appliquée ici pour que les appelants passent `<Icon />` sans `className`.
const emptyStateStack = {
  sm: "gap-1.5 text-xs [&_[data-slot=empty-state-icon]_svg]:size-5",
  md: "gap-2 text-sm [&_[data-slot=empty-state-icon]_svg]:size-6",
} as const

const emptyStatePadding = { sm: "p-4", md: "p-6" } as const

type EmptyStateProps = {
  icon?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Densité : `md` plein cadre (défaut), `sm` compact dans une liste. */
  size?: "sm" | "md"
  /** Remplit le parent et centre (défaut). `false` = bloc compact non extensible. */
  fill?: boolean
  /** Orientation des actions. `row` par défaut, `col` pour empiler des cards. */
  actionsDirection?: "row" | "col"
  className?: string
}

const EmptyState = ({
  icon,
  title,
  description,
  actions,
  size = "md",
  fill = true,
  actionsDirection = "row",
  className,
}: EmptyStateProps) => {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex items-center justify-center",
        fill ? "flex-1" : "w-full",
        emptyStatePadding[size],
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center text-center text-muted-foreground",
          emptyStateStack[size],
        )}
      >
        {icon !== undefined ? (
          <div data-slot="empty-state-icon" className="text-muted-foreground">
            {icon}
          </div>
        ) : null}
        {title !== undefined ? (
          <div
            data-slot="empty-state-title"
            className="font-medium text-foreground"
          >
            {title}
          </div>
        ) : null}
        {description !== undefined ? (
          <div
            data-slot="empty-state-description"
            className="max-w-md text-balance"
          >
            {description}
          </div>
        ) : null}
        {actions !== undefined ? (
          <div
            data-slot="empty-state-actions"
            className={cn(
              "mt-2 flex justify-center gap-2",
              actionsDirection === "col"
                ? "flex-col items-stretch"
                : "items-center",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

type LoadingStateProps = {
  label?: React.ReactNode
  className?: string
}

const LoadingState = ({
  label = "Chargement…",
  className,
}: LoadingStateProps) => {
  return (
    <div
      data-slot="loading-state"
      className={cn(
        "flex flex-1 items-center justify-center p-6",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        {label !== undefined && label !== null ? (
          <div data-slot="loading-state-label">{label}</div>
        ) : null}
      </div>
    </div>
  )
}

type ErrorStateProps = {
  message: React.ReactNode
  /** "block" (default): centered card with icon. "inline": compact banner usable inside a panel header strip. */
  variant?: "block" | "inline"
  actions?: React.ReactNode
  className?: string
}

const ErrorState = ({
  message,
  variant = "block",
  actions,
  className,
}: ErrorStateProps) => {
  if (variant === "inline") {
    return (
      <div
        data-slot="error-state"
        data-variant="inline"
        role="alert"
        className={cn(
          "flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive",
          className,
        )}
      >
        <AlertCircle className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{message}</span>
        {actions !== undefined ? (
          <div data-slot="error-state-actions" className="shrink-0">
            {actions}
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div
      data-slot="error-state"
      data-variant="block"
      role="alert"
      className={cn(
        "flex flex-1 items-center justify-center p-6",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2 text-center text-sm text-destructive">
        <AlertCircle className="size-5" />
        <div data-slot="error-state-message" className="max-w-md">
          {message}
        </div>
        {actions !== undefined ? (
          <div
            data-slot="error-state-actions"
            className="mt-2 flex items-center justify-center gap-2"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default EmptyState
export { EmptyState, ErrorState, LoadingState }
export type { EmptyStateProps, ErrorStateProps, LoadingStateProps }
