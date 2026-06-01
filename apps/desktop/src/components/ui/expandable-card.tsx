/**
 * Card-like collapsible primitive — header bar with a chevron + colored
 * left accent + scrollable body. Niche to "item-of-a-list with colored
 * accent" (debug breakpoints, expandable runs, etc.).
 *
 * For section-of-a-page or panel-of-an-inspector collapsibles, use
 * `<Section collapsible variant="flat" | "panel" | "card">` instead — it
 * shares the same `useCollapsibleState` hook and chevron animation.
 */
import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { ScrollArea } from "./scroll-area"
import { useCollapsibleState } from "./use-collapsible-state"

const expandableCardVariants = cva(
  "w-full overflow-hidden rounded-md border border-border border-l-[3px] bg-muted/40 text-xs",
  {
    variants: {
      accent: {
        default: "border-l-border",
        primary: "border-l-primary",
        destructive: "border-l-destructive",
        success: "border-l-emerald-600",
        warning: "border-l-amber-500",
        accent: "border-l-violet-500",
      },
      density: {
        default: "my-1",
        compact: "my-0",
      },
    },
    defaultVariants: {
      accent: "default",
      density: "default",
    },
  }
)

type ExpandableCardProps = {
  header: React.ReactNode
  children: React.ReactNode
  defaultExpanded?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  /** Cf. `useCollapsibleState` — keep namespacing in sync with `<Section>`. */
  persistKey?: string
  scrollable?: boolean
  maxBodyHeight?: number
  className?: string
  compact?: boolean
} & VariantProps<typeof expandableCardVariants>

const ExpandableCard = ({
  header,
  children,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
  persistKey,
  accent,
  scrollable = true,
  maxBodyHeight = 320,
  className,
  compact = false,
}: ExpandableCardProps) => {
  const { open: expanded, toggle } = useCollapsibleState({
    persistKey,
    defaultOpen: defaultExpanded,
    controlled: controlledExpanded,
    onOpenChange: onExpandedChange,
  })

  return (
    <div
      data-slot="expandable-card"
      data-expanded={expanded ? "true" : "false"}
      className={cn(
        expandableCardVariants({
          accent,
          density: compact ? "compact" : "default",
        }),
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        data-slot="expandable-card-header"
        className={cn(
          "flex w-full items-center gap-2 border-b border-border bg-muted/60 text-left hover:bg-muted/80",
          compact ? "px-1.5 py-0.5" : "px-2 py-1.5",
        )}
      >
        <ChevronRight
          className={cn(
            "shrink-0 transition-transform",
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
            expanded && "rotate-90",
          )}
        />
        {header}
      </button>
      {expanded ? (
        scrollable ? (
          <ScrollArea
            data-slot="expandable-card-body"
            style={{ maxHeight: maxBodyHeight }}
          >
            {children}
          </ScrollArea>
        ) : (
          <div data-slot="expandable-card-body">{children}</div>
        )
      ) : null}
    </div>
  )
}

export default ExpandableCard
export { ExpandableCard, expandableCardVariants }
export type { ExpandableCardProps }
