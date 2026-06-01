import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      tone: {
        neutral:
          "border-muted-foreground/30 bg-muted text-muted-foreground",
        info: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
        warning:
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        success:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        accent:
          "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400",
        danger: "border-destructive/40 bg-destructive/10 text-destructive",
      },
      size: {
        default: "h-5 px-2 py-0.5 text-xs",
        sm: "h-auto rounded-md px-1.5 py-0.5 text-2xs",
      },
      font: {
        default: "font-medium",
        mono: "font-mono font-normal",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      font: "default",
    },
  }
)

type BadgeProps = useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>

const Badge = ({
  className,
  variant,
  tone,
  size,
  font,
  render,
  ...props
}: BadgeProps) => {
  const resolvedVariant = tone ? "outline" : variant ?? "default"
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(
          badgeVariants({ variant: resolvedVariant, tone, size, font }),
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant: resolvedVariant,
      tone,
      size,
      font,
    },
  })
}

export { Badge, badgeVariants }
export type { BadgeProps }
