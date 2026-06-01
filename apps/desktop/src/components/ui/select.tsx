import * as React from "react"

import { cn } from "@/lib/utils"

const Select = ({ className, children, ...props }: React.ComponentProps<"select">) => {
  return (
    <select
      data-slot="select"
      className={cn(
        "w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { Select }
