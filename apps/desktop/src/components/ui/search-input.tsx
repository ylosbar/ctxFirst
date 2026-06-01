import * as React from "react"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const SearchInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, ...props }, ref) => (
  <div className="relative">
    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    <Input
      ref={ref}
      type="search"
      className={cn("h-7 pl-7 text-xs", className)}
      {...props}
    />
  </div>
))
SearchInput.displayName = "SearchInput"

export { SearchInput }
