import * as React from "react"

import { cn } from "@/lib/utils"
import { FormLabel } from "./form-label"

type FormFieldOrientation = "vertical" | "inline"

type FormFieldProps = {
  label?: React.ReactNode
  description?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
  htmlFor?: string
  orientation?: FormFieldOrientation
  className?: string
  children: React.ReactNode
}

const FormField = ({
  label,
  description,
  error,
  required,
  htmlFor,
  orientation = "vertical",
  className,
  children,
}: FormFieldProps) => {
  if (orientation === "inline") {
    return (
      <div
        data-slot="form-field"
        data-orientation="inline"
        className={cn("flex flex-col gap-1", className)}
      >
        <div className="flex flex-row items-center gap-2">
          {children}
          {label !== undefined ? (
            <FormLabel htmlFor={htmlFor} required={required}>
              {label}
            </FormLabel>
          ) : null}
        </div>
        {description !== undefined ? (
          <p
            data-slot="form-field-description"
            className="text-xs text-muted-foreground/80"
          >
            {description}
          </p>
        ) : null}
        {error !== undefined ? (
          <p data-slot="form-field-error" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-slot="form-field"
      data-orientation="vertical"
      className={cn("flex flex-col gap-1", className)}
    >
      {label !== undefined ? (
        <FormLabel htmlFor={htmlFor} required={required}>
          {label}
        </FormLabel>
      ) : null}
      {description !== undefined ? (
        <p
          data-slot="form-field-description"
          className="text-xs text-muted-foreground/80"
        >
          {description}
        </p>
      ) : null}
      {children}
      {error !== undefined ? (
        <p data-slot="form-field-error" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default FormField
export { FormField }
export type { FormFieldProps }
