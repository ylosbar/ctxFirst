import * as React from "react"

import { cn } from "@/lib/utils"

type PageHeaderSize = "default" | "sm"

type PageHeaderProps = {
  title: React.ReactNode
  /** Sous-titre optionnel rendu sous le titre. */
  description?: React.ReactNode
  icon?: React.ReactNode
  trailing?: React.ReactNode
  actions?: React.ReactNode
  /** `default` = chrome de page (h-10, px-4). `sm` = chrome de panel (min-h-8, px-3). */
  size?: PageHeaderSize
  className?: string
}

const sizeClasses: Record<PageHeaderSize, { wrapper: string; title: string }> = {
  default: {
    wrapper: "min-h-10 px-4 py-1.5",
    title: "truncate text-sm font-semibold",
  },
  sm: {
    wrapper: "min-h-8 px-3 py-1",
    title: "truncate text-sm font-semibold",
  },
}

const PageHeader = ({
  title,
  description,
  icon,
  trailing,
  actions,
  size = "default",
  className,
}: PageHeaderProps) => {
  const styles = sizeClasses[size]
  return (
    <div
      data-slot="page-header"
      data-size={size}
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 border-b",
        styles.wrapper,
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          {icon !== undefined ? (
            <span data-slot="page-header-icon" className="shrink-0 text-muted-foreground">
              {icon}
            </span>
          ) : null}
          <h2 data-slot="page-header-title" className={styles.title}>
            {title}
          </h2>
          {trailing !== undefined ? (
            <span data-slot="page-header-trailing" className="shrink-0">
              {trailing}
            </span>
          ) : null}
        </div>
        {description !== undefined ? (
          <p
            data-slot="page-header-description"
            className="truncate text-xs text-muted-foreground"
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions !== undefined ? (
        <div
          data-slot="page-header-actions"
          className="flex shrink-0 items-center gap-1"
        >
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export default PageHeader
export { PageHeader }
export type { PageHeaderProps, PageHeaderSize }
