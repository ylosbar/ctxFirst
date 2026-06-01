import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const panelBodyVariants = cva("min-h-0 flex-1 overflow-auto", {
  variants: {
    padding: {
      none: "",
      sm: "px-3 py-2",
      default: "px-4 py-3",
      lg: "px-6 py-5",
    },
  },
  defaultVariants: {
    padding: "default",
  },
})

type PanelBodyProps = React.ComponentProps<"div"> &
  VariantProps<typeof panelBodyVariants>

/**
 * Région de contenu scrollable d'un panneau, sous un header bord-à-bord.
 * Porte le padding de contenu (variant `padding`) — le header reste, lui,
 * géré séparément pour pouvoir toucher les bords (border-b pleine largeur).
 */
const PanelBody = ({ className, padding, children, ...props }: PanelBodyProps) => {
  return (
    <div
      data-slot="panel-body"
      className={cn(panelBodyVariants({ padding }), className)}
      {...props}
    >
      {children}
    </div>
  )
}

export default PanelBody
export { PanelBody, panelBodyVariants }
export type { PanelBodyProps }
