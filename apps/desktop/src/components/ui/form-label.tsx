import * as React from "react"

import { cn } from "@/lib/utils"

type FormLabelProps = {
  htmlFor?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

const FormLabel = ({ htmlFor, required, className, children }: FormLabelProps) => {
  return (
    <label
      data-slot="form-label"
      htmlFor={htmlFor}
      className={cn("text-xs font-medium text-muted-foreground", className)}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      ) : null}
    </label>
  )
}

export default FormLabel
export { FormLabel }
