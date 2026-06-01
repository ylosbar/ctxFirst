import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { useCollapsibleState } from "./use-collapsible-state"

const sectionVariants = cva("flex flex-col", {
  variants: {
    density: {
      default: "gap-4",
      compact: "gap-2",
    },
  },
  defaultVariants: {
    density: "default",
  },
})

type SectionVariant = "flat" | "panel" | "card"
type SectionLevel = 2 | 3 | 4

type SectionProps = {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode

  /** Pliable. Off par défaut → comportement actuel. */
  collapsible?: boolean
  /** Uncontrolled — état initial. */
  defaultOpen?: boolean
  /** Controlled. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Suffixe `localStorage` (préfixe `ui.collapsible.app.` injecté par le hook).
   * Côté plugin, l'host wrappe `Section` pour préfixer `plugin.<id>.`.
   */
  persistKey?: string
  /** Démonte les enfants quand fermé (utile pour bodies lourds). */
  unmountOnClose?: boolean

  /** Habillage visuel — ignoré si `collapsible` est faux. */
  variant?: SectionVariant
  /** Sticky header — implicite quand `variant="panel"`. */
  sticky?: boolean

  /** Avant le titre (dot/status/icon). */
  leading?: React.ReactNode
  /** Entre titre et actions (badge count). */
  trailing?: React.ReactNode

  /** Niveau sémantique du titre (default 3). */
  level?: SectionLevel
} & VariantProps<typeof sectionVariants>

const headerWrapperVariants = (
  variant: SectionVariant,
  sticky: boolean,
  collapsible: boolean,
): string => {
  if (!collapsible) return ""
  switch (variant) {
    case "panel":
      return cn(
        "border-b border-border/50 bg-muted/40 px-3 py-2.5 backdrop-blur-sm",
        sticky && "sticky top-0 z-[1]",
      )
    case "card":
      return cn("bg-muted/30 px-3 py-2", sticky && "sticky top-0 z-[1]")
    case "flat":
    default:
      return cn("py-2", sticky && "sticky top-0 z-[1] bg-background/95 backdrop-blur-sm")
  }
}

const titleClassFor = (variant: SectionVariant, collapsible: boolean): string => {
  if (collapsible && variant === "panel") {
    return "text-xs font-semibold text-foreground"
  }
  return "text-sm font-semibold text-foreground"
}

const Section = ({
  title,
  description,
  actions,
  density,
  className,
  children,
  collapsible = false,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  persistKey,
  unmountOnClose = false,
  variant = "flat",
  sticky,
  leading,
  trailing,
  level = 3,
}: SectionProps) => {
  const reactId = React.useId()
  const bodyId = `section-body-${reactId}`

  const {
    open,
    toggle,
  } = useCollapsibleState({
    persistKey: collapsible ? persistKey : undefined,
    defaultOpen,
    controlled: collapsible ? controlledOpen : undefined,
    onOpenChange,
  })

  const effectiveSticky = sticky ?? variant === "panel"
  const isOpen = collapsible ? open : true
  const hasHeader = title !== undefined || actions !== undefined || leading !== undefined || trailing !== undefined
  const TitleTag = (`h${level}` as unknown) as React.ElementType
  const titleClass = titleClassFor(variant, collapsible)

  const wrapperClass = cn(
    "flex flex-col",
    collapsible && variant === "card" && "rounded-md border border-border overflow-hidden",
    !collapsible && sectionVariants({ density }),
    className,
  )

  const innerGapClass = collapsible ? sectionVariants({ density }) : ""

  const headerContent = (
    <>
      {collapsible ? (
        <ChevronRight
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform text-muted-foreground",
            isOpen && "rotate-90",
          )}
        />
      ) : null}
      {leading !== undefined ? (
        <span data-slot="section-leading" className="flex shrink-0 items-center">
          {leading}
        </span>
      ) : null}
      {title !== undefined ? (
        <TitleTag
          data-slot="section-title"
          className={cn(titleClass, "flex-1 text-left")}
        >
          {title}
        </TitleTag>
      ) : (
        <span className="flex-1" />
      )}
      {trailing !== undefined ? (
        <span data-slot="section-trailing" className="shrink-0">
          {trailing}
        </span>
      ) : null}
    </>
  )

  const header = hasHeader ? (
    collapsible ? (
      <div
        data-slot="section-header"
        data-open={isOpen ? "true" : "false"}
        className={cn(
          "flex items-center gap-1.5",
          headerWrapperVariants(variant, effectiveSticky, true),
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {headerContent}
        </button>
        {actions !== undefined ? (
          <div
            data-slot="section-actions"
            className="flex shrink-0 items-center gap-2"
          >
            {actions}
          </div>
        ) : null}
      </div>
    ) : (
      <div
        data-slot="section-header"
        className="flex items-center justify-between gap-2"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {leading !== undefined ? (
            <span data-slot="section-leading" className="flex shrink-0 items-center">
              {leading}
            </span>
          ) : null}
          {title !== undefined ? (
            <TitleTag data-slot="section-title" className={titleClass}>
              {title}
            </TitleTag>
          ) : null}
          {trailing !== undefined ? (
            <span data-slot="section-trailing" className="shrink-0">
              {trailing}
            </span>
          ) : null}
        </div>
        {actions !== undefined ? (
          <div data-slot="section-actions" className="flex items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    )
  ) : null

  const descriptionNode =
    description !== undefined ? (
      <p
        data-slot="section-description"
        className="text-xs text-muted-foreground"
      >
        {description}
      </p>
    ) : null

  const bodyInner = (
    <div className={cn("flex flex-col", innerGapClass)}>
      {descriptionNode}
      {children}
    </div>
  )

  const body = collapsible ? (
    unmountOnClose ? (
      isOpen ? (
        <div
          id={bodyId}
          data-slot="section-body"
          className={cn(variant === "card" ? "p-3" : "pt-1.5")}
        >
          {bodyInner}
        </div>
      ) : null
    ) : (
      <div
        id={bodyId}
        data-slot="section-body"
        data-open={isOpen ? "true" : "false"}
        className="grid transition-[grid-template-rows] duration-150 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
        aria-hidden={!isOpen}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              variant === "card"
                ? "p-3"
                : variant === "panel"
                  ? "pl-9 pr-3 pt-3 pb-2"
                  : "pt-1.5",
            )}
          >
            {bodyInner}
          </div>
        </div>
      </div>
    )
  ) : (
    <>
      {descriptionNode}
      {children}
    </>
  )

  return (
    <section
      data-slot="section"
      data-variant={variant}
      data-collapsible={collapsible ? "true" : "false"}
      className={wrapperClass}
    >
      {header}
      {body}
    </section>
  )
}

export default Section
export { Section, sectionVariants }
export type { SectionProps, SectionVariant, SectionLevel }
