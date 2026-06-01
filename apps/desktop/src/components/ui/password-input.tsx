import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Input } from "./input"

type PasswordInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type"
> & {
  revealLabel?: string
  hideLabel?: string
}

const PasswordInput = ({
  revealLabel = "Afficher",
  hideLabel = "Masquer",
  className,
  ...props
}: PasswordInputProps) => {
  const [reveal, setReveal] = React.useState(false)
  return (
    <div data-slot="password-input" className="relative w-full">
      <Input
        type={reveal ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        className={cn("pr-9", className)}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={reveal ? hideLabel : revealLabel}
        onClick={() => setReveal((r) => !r)}
        className="absolute inset-y-0 right-1 my-auto text-muted-foreground hover:text-foreground"
      >
        {reveal ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  )
}

export default PasswordInput
export { PasswordInput }
export type { PasswordInputProps }
