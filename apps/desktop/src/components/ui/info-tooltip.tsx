import * as React from "react"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

type InfoTooltipProps = {
  /** Explication révélée dans le tooltip (survol / focus clavier). */
  content: React.ReactNode
  /**
   * Nom accessible du déclencheur. Par défaut, `content` s'il est une chaîne.
   */
  label?: string
  /** Côté d'apparition du tooltip. */
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  className?: string
}

/**
 * Petit déclencheur « ⓘ » : une icône info qui révèle une explication en
 * tooltip. Remplace les sous-titres d'explication (description de `Section`,
 * `FormField`, …) pour alléger formulaires et en-têtes.
 */
const InfoTooltip = ({ content, label, side, className }: InfoTooltipProps) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={
            label ?? (typeof content === "string" ? content : undefined)
          }
          className={cn("text-muted-foreground", className)}
        >
          <Info />
        </Button>
      }
    />
    <TooltipContent side={side}>{content}</TooltipContent>
  </Tooltip>
)

export default InfoTooltip
export { InfoTooltip }
export type { InfoTooltipProps }
