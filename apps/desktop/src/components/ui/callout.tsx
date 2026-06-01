import * as React from "react"
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const calloutVariants = cva(
  "flex gap-2 rounded-md border p-3 text-sm",
  {
    variants: {
      tone: {
        info: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
        warning:
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        success:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        danger: "border-destructive/40 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  },
)

const DEFAULT_ICON: Record<
  NonNullable<VariantProps<typeof calloutVariants>["tone"]>,
  React.ComponentType<{ className?: string }>
> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  danger: XCircle,
}

type CalloutProps = {
  tone: NonNullable<VariantProps<typeof calloutVariants>["tone"]>
  title?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

const Callout = ({
  tone,
  title,
  icon,
  actions,
  className,
  children,
}: CalloutProps) => {
  const DefaultIcon = DEFAULT_ICON[tone]
  const resolvedIcon =
    icon !== undefined ? icon : <DefaultIcon className="size-4" />
  return (
    <div
      data-slot="callout"
      data-tone={tone}
      className={cn(calloutVariants({ tone }), className)}
    >
      <div
        aria-hidden={icon === null ? "true" : undefined}
        data-slot="callout-icon"
        className="mt-0.5 shrink-0"
      >
        {resolvedIcon}
      </div>
      <div
        data-slot="callout-body"
        className="flex min-w-0 flex-1 flex-col gap-1"
      >
        {title !== undefined ? (
          <div
            data-slot="callout-title"
            className="text-sm font-semibold"
          >
            {title}
          </div>
        ) : null}
        {children !== undefined ? (
          <div data-slot="callout-content" className="text-sm">
            {children}
          </div>
        ) : null}
        {actions !== undefined ? (
          <div
            data-slot="callout-actions"
            className="mt-1 flex items-center justify-end gap-2"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default Callout
export { Callout, calloutVariants }
export type { CalloutProps }
