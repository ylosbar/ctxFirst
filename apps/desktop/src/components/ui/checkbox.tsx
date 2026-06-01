import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

type CheckboxProps = {
  checked?: boolean | "indeterminate"
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  required?: boolean
  id?: string
  name?: string
  className?: string
  "aria-label"?: string
}

const Checkbox = ({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  required,
  id,
  name,
  className,
  ...ariaProps
}: CheckboxProps) => {
  const isIndeterminate = checked === "indeterminate"
  const resolvedChecked =
    checked === "indeterminate" ? undefined : checked

  return (
    <CheckboxPrimitive.Root
      id={id}
      name={name}
      checked={resolvedChecked}
      defaultChecked={defaultChecked}
      indeterminate={isIndeterminate}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      required={required}
      data-slot="checkbox"
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background text-primary-foreground outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-[checked]:border-primary data-[checked]:bg-primary",
        "data-[indeterminate]:border-primary data-[indeterminate]:bg-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...ariaProps}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        {isIndeterminate ? (
          <Minus className="size-3" />
        ) : (
          <Check className="size-3" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export default Checkbox
export { Checkbox }
export type { CheckboxProps }
