import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Placeholder de chargement. Affiche un bloc neutre parcouru par un reflet
 * (shimmer, cf. `.skeleton-shimmer` dans App.css). Dimensionner via `className`
 * (`h-*`, `w-*`, `rounded-*`). Respecte `prefers-reduced-motion` (reflet coupé).
 */
const Skeleton = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "skeleton-shimmer rounded-md bg-foreground/[0.06]",
        className,
      )}
      {...props}
    />
  )
}

export default Skeleton
export { Skeleton }
