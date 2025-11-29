import { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground bg-card/50 border-border flex h-10 w-full min-w-0 rounded-lg border-2 backdrop-blur-sm px-4 py-2 text-base shadow-lg transition-[color,box-shadow,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "shadow-[inset_0_2px_4px_oklch(0_0_0_/_0.15),inset_0_1px_2px_oklch(0_0_0_/_0.1)]",
        "focus-visible:border-[oklch(0.40_0.08_300)] focus-visible:bg-[oklch(0.19_0.03_270)] focus-visible:shadow-[0_0_12px_oklch(0.35_0.08_300_/_0.4),inset_0_2px_4px_oklch(0_0_0_/_0.15)]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
