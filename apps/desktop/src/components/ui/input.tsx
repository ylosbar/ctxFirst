import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        data-slot="input"
        className={cn(
          "w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"

export { Input }
